import { makeCatalogue } from "../lib/catalogue";
import { isStandalone, keepStorage } from "../lib/install";
import { shuffle } from "../lib/random";
import { defaultWeek, mondayOf } from "../lib/week";
import {
  freshHousehold,
  householdReducer,
  normalizeHousehold,
  type Household,
  type HouseholdAction,
} from "../shared/household";
import {
  receive,
  visibleState,
  type ClientMessage,
  type ClientSync,
  type Envelope,
  type ServerMessage,
} from "../shared/sync";
import { isSwipe, popUndo, type Swipe } from "./swipes";

import type { Action, AppState } from "./types";

export type { Action, AppState } from "./types";

export type Connection = "connecting" | "online" | "offline";

export type SyncStatus =
  | { mode: "solo" }
  | {
      mode: "household";
      key: string;
      connection: Connection;
      /** Changes made on this phone the server hasn't confirmed yet. */
      pending: number;
      /** Received the household at least once since joining. */
      joined: boolean;
    };

interface Persisted {
  household: Household;
  swipes: Swipe[];
  /** Only while in a shared household. `household` is then the last state the server confirmed. */
  sync?: { key: string; version: number; pending: Envelope[]; joined: boolean };
}

const STORAGE_KEY = "crumble/v1";
const RECONNECT_DELAYS = [1, 2, 5, 10, 30].map((s) => s * 1000);
/**
 * A dropped signal often leaves a socket that looks open but delivers nothing. While the app is on screen it pings the
 * server (answered by Cloudflare without waking the Durable Object) and reconnects when no answer comes.
 */
const PING_EVERY_MS = 20_000;
const PONG_TIMEOUT_MS = 8_000;

const freshState = () => freshHousehold(shuffle(makeCatalogue().swipeable.map((m) => m.id)), defaultWeek());

function load(): Persisted {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (stored && typeof stored === "object") {
      const sync = stored.sync && typeof stored.sync.key === "string" ? stored.sync : undefined;
      return {
        household: normalizeHousehold(stored.household, defaultWeek()),
        swipes: Array.isArray(stored.swipes) ? stored.swipes.filter(isSwipe) : [],
        sync: sync && {
          key: sync.key,
          version: Number.isInteger(sync.version) ? sync.version : -1,
          pending: Array.isArray(sync.pending) ? sync.pending : [],
          joined: sync.joined === true,
        },
      };
    }
  } catch {
    // Unreadable storage starts fresh.
  }
  return { household: freshState(), swipes: [] };
}

/**
 * The app's state, alone on this phone or shared with a household. Shared, every change goes through the household's
 * Durable Object (see `src/shared/sync.ts`); offline changes wait in `pending` and are sent on reconnect.
 */
export class AppStore {
  private sync: ClientSync;
  private key: string | null;
  private joined: boolean;
  private swipes: Swipe[];
  private connection: Connection = "offline";
  private socket: WebSocket | null = null;
  private attempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private pingTimer?: ReturnType<typeof setInterval>;
  private pongTimer?: ReturnType<typeof setTimeout>;
  private view!: AppState;
  private status!: SyncStatus;
  private listeners = new Set<() => void>();
  /** Set by the UI to show messages, like a household link that no longer works. */
  onNotice?: (message: string) => void;

  constructor() {
    const stored = load();
    this.swipes = stored.swipes;
    this.key = stored.sync?.key ?? null;
    this.joined = stored.sync?.joined ?? false;
    this.sync = {
      confirmed: stored.household,
      version: stored.sync?.version ?? 0,
      pending: stored.sync?.pending ?? [],
    };
    this.update(false);
    this.keepWeekCurrent();
    // Back on the network or back on screen: check the connection right away.
    addEventListener("online", () => this.checkConnection());
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && this.checkConnection());
    this.connect();
    // A shared household's link only lives here: ask the browser to keep it. Not on a first visit, where Firefox
    // would ask about storage before the person has done anything.
    if (this.key || isStandalone()) void keepStorage();
  }

  getState = () => this.view;
  getStatus = () => this.status;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch = (action: Action) => {
    let shared: HouseholdAction | undefined;
    if (action.type === "undo") {
      const { swipes, undo } = popUndo(this.swipes, this.view);
      this.swipes = swipes;
      shared = undo && { type: "unswipe", id: undo.id };
    } else {
      shared = action;
      if (action.type === "swipe") this.swipes = [...this.swipes, { id: action.id, liked: action.liked }];
      if (action.type === "reviewNoped" || action.type === "resetChoices") this.swipes = [];
      if (action.type === "like" || action.type === "unlike")
        this.swipes = this.swipes.filter((swipe) => swipe.id !== action.id);
    }
    if (shared) this.apply(shared);
    else this.update();
  };

  // ---------- Household ----------

  /** Shares this phone's state as a new household. */
  async createHousehold(): Promise<void> {
    const response = await fetch("/api/households", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ household: this.view }),
    });
    if (!response.ok) throw new Error(`Création impossible (${response.status})`);
    const { key, version } = (await response.json()) as { key: string; version: number };
    this.key = key;
    this.joined = true;
    this.sync = { confirmed: visibleState(this.sync), version, pending: [] };
    this.update();
    this.connect();
    void keepStorage();
  }

  /** Replaces this phone's state with the household's, once it arrives. */
  join(key: string) {
    if (key === this.key) return;
    this.leave(false);
    this.key = key;
    this.joined = false;
    this.sync = { ...this.sync, version: -1, pending: [] };
    this.swipes = [];
    this.update();
    this.connect();
    void keepStorage();
  }

  /** Stops sharing. This phone keeps a copy of everything, including changes not sent yet. */
  leave(notify = true) {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    clearTimeout(this.pongTimer);
    this.key = null;
    this.sync = { confirmed: visibleState(this.sync), version: 0, pending: [] };
    if (notify) this.update();
  }

  inviteLink(): string | undefined {
    return this.key ? `${location.origin}/#rejoindre=${this.key}` : undefined;
  }

  // ---------- Internals ----------

  private apply(action: HouseholdAction) {
    if (!this.key) {
      this.sync = { ...this.sync, confirmed: householdReducer(this.sync.confirmed, action) };
    } else {
      const envelope: Envelope = { id: crypto.randomUUID(), action };
      this.sync = { ...this.sync, pending: [...this.sync.pending, envelope] };
      if (this.connection === "online") this.send({ t: "act", ...envelope });
    }
    this.update();
  }

  /** The planned week never lags behind: once a week is over, plan the current one. */
  private keepWeekCurrent() {
    if (this.view.week < mondayOf(new Date())) this.apply({ type: "setWeek", week: defaultWeek() });
  }

  private connect() {
    if (!this.key || this.socket) return;
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${location.host}/api/households/${encodeURIComponent(this.key)}/sync`);
    this.socket = socket;
    this.setConnection("connecting");
    socket.onopen = () => {
      this.send({ t: "hello" });
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => document.visibilityState === "visible" && this.ping(), PING_EVERY_MS);
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      if (event.data === "pong") return clearTimeout(this.pongTimer);
      try {
        this.receive(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        // Ignore anything unreadable; the next snapshot repairs the state.
      }
    };
    socket.onclose = () => this.dropSocket(socket);
  }

  /** Forgets a socket that closed or stopped answering, and schedules a reconnection. */
  private dropSocket(socket: WebSocket) {
    if (this.socket !== socket) return;
    this.socket = null;
    clearInterval(this.pingTimer);
    clearTimeout(this.pongTimer);
    socket.close();
    this.setConnection("offline");
    const delay = RECONNECT_DELAYS[Math.min(this.attempts++, RECONNECT_DELAYS.length - 1)];
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private ping() {
    const socket = this.socket;
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send("ping");
    clearTimeout(this.pongTimer);
    this.pongTimer = setTimeout(() => this.dropSocket(socket), PONG_TIMEOUT_MS);
  }

  private checkConnection() {
    if (!this.key) return;
    if (this.socket) return this.ping();
    clearTimeout(this.reconnectTimer);
    this.attempts = 0;
    this.connect();
  }

  private receive(message: ServerMessage) {
    if (message.t === "notice") {
      this.onNotice?.(message.text);
      return;
    }
    if (message.t === "unknown") {
      this.leave(false);
      this.onNotice?.("Ce lien de foyer ne marche pas ou plus. Tu continues seul sur ce téléphone.");
      this.update();
      return;
    }
    const { sync, resync } = receive(this.sync, message);
    this.sync = sync;
    if (message.t === "snapshot") {
      this.attempts = 0;
      this.joined = true;
      this.connection = "online";
      // Resend what this phone did offline. Actions the server already has come back as duplicates.
      for (const envelope of sync.pending) this.send({ t: "act", ...envelope });
    }
    if (resync) this.send({ t: "hello" });
    this.update();
    if (message.t === "snapshot") this.keepWeekCurrent();
  }

  private send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private setConnection(connection: Connection) {
    this.connection = connection;
    this.update();
  }

  private update(notify = true) {
    this.view = { ...visibleState(this.sync), swipes: this.swipes };
    const status: SyncStatus = this.key
      ? {
          mode: "household",
          key: this.key,
          connection: this.connection,
          pending: this.sync.pending.length,
          joined: this.joined,
        }
      : { mode: "solo" };
    if (JSON.stringify(status) !== JSON.stringify(this.status)) this.status = status;
    const persisted: Persisted = {
      household: this.sync.confirmed,
      swipes: this.swipes,
      sync: this.key
        ? { key: this.key, version: this.sync.version, pending: this.sync.pending, joined: this.joined }
        : undefined,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // Private browsing or full storage: keep working in memory.
    }
    if (notify) for (const listener of this.listeners) listener();
  }
}

let instance: AppStore | undefined;

/** One store per page, created on first use. */
export const getAppStore = () => (instance ??= new AppStore());
