// Live sync between a household's phones, through its Durable Object.
//
// The server holds the household and a version number. A phone sends each action with a unique id; the server applies
// it in arrival order and broadcasts it, with the new version, to every phone (the sender included). A phone shows
// its own actions immediately on top of the last state the server confirmed, and replays them after each confirmed
// change ("rebase"). Because the reducer is deterministic, every phone ends up with the server's state.

import { householdReducer, isHouseholdAction, type Household, type HouseholdAction } from "./household";

export interface Envelope {
  /** Unique per action, so an action resent after a reconnect is applied once. */
  id: string;
  action: HouseholdAction;
}

export type ClientMessage = { t: "hello" } | ({ t: "act" } & Envelope);

export type ServerMessage =
  | { t: "snapshot"; version: number; state: Household }
  | { t: "applied"; version: number; id: string; action: HouseholdAction }
  /** Already applied before a reconnect: its effect is in the latest snapshot. */
  | { t: "duplicate"; id: string }
  | { t: "rejected"; id: string }
  /** The household doesn't exist (a wrong or expired link). */
  | { t: "unknown" }
  /** Something to tell the people using the app, like what a connected agent just did. */
  | { t: "notice"; text: string };

/** Largest message accepted, in bytes. */
export const MAX_MESSAGE_BYTES = 512 * 1024;

// ---------- Server ----------

export interface ServerState {
  household: Household;
  version: number;
  /** Ids of the last applied actions, to ignore resends. */
  recent: string[];
}

const RECENT_IDS = 500;

export function applyOnServer(server: ServerState, envelope: unknown): { server: ServerState; reply: ServerMessage } {
  const e = envelope as Partial<Envelope>;
  const id = typeof e?.id === "string" && e.id.length <= 64 ? e.id : "";
  if (!id || !isHouseholdAction(e.action)) return { server, reply: { t: "rejected", id } };
  if (server.recent.includes(id)) return { server, reply: { t: "duplicate", id } };
  let household: Household;
  try {
    household = householdReducer(server.household, e.action);
  } catch {
    return { server, reply: { t: "rejected", id } };
  }
  const version = server.version + 1;
  return {
    server: { household, version, recent: [...server.recent, id].slice(-RECENT_IDS) },
    reply: { t: "applied", version, id, action: e.action },
  };
}

// ---------- Phone ----------

export interface ClientSync {
  /** Last state the server confirmed, at `version`. `-1` until the first snapshot after joining. */
  confirmed: Household;
  version: number;
  /** Actions sent or waiting to be sent, not confirmed yet, in order. */
  pending: Envelope[];
}

/** What the phone shows: the confirmed state with its own unconfirmed actions on top. */
export const visibleState = (sync: ClientSync): Household =>
  sync.pending.reduce((state, e) => householdReducer(state, e.action), sync.confirmed);

/** Applies a server message. `resync` means a message was missed: ask for a fresh snapshot. */
export function receive(sync: ClientSync, message: ServerMessage): { sync: ClientSync; resync?: boolean } {
  switch (message.t) {
    case "snapshot":
      return { sync: { ...sync, confirmed: message.state, version: message.version } };
    case "applied": {
      if (message.version <= sync.version) return { sync };
      if (message.version !== sync.version + 1) return { sync, resync: true };
      return {
        sync: {
          confirmed: householdReducer(sync.confirmed, message.action),
          version: message.version,
          pending: sync.pending.filter((e) => e.id !== message.id),
        },
      };
    }
    case "duplicate":
    case "rejected":
      return { sync: { ...sync, pending: sync.pending.filter((e) => e.id !== message.id) } };
    case "unknown":
    case "notice":
      return { sync };
  }
}
