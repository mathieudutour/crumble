import { DurableObject } from "cloudflare:workers";
import { normalizeHousehold } from "../src/shared/household";
import { handleMcp } from "../src/shared/mcp";
import { createTools } from "../src/webmcp/tools";
import {
  applyOnServer,
  MAX_MESSAGE_BYTES,
  type ClientMessage,
  type ServerMessage,
  type ServerState,
} from "../src/shared/sync";

/** A household that nobody opens for this long is deleted. */
const EXPIRY_MS = 400 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = "household";
const AGENTS_KEY = "agents";
const MAX_AGENTS = 10;

/** An agent allowed to use the household through MCP. Only a hash of its secret is kept. */
interface Agent {
  id: string;
  label: string;
  hash: string;
  createdAt: string;
  lastUsedAt?: string;
}

const randomId = (bytes: number) =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const unauthorized = () =>
  Response.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid or revoked Crumble agent token" } },
    { status: 401, headers: { "www-authenticate": 'Bearer realm="crumble"' } },
  );

/**
 * One Durable Object per household: it holds the shared state and relays every change to the household's phones
 * over WebSockets (see `src/shared/sync.ts`). Sockets use the hibernation API, so an idle household costs nothing.
 */
export class Household extends DurableObject<Env> {
  private server: ServerState | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Phones ping to detect dead connections; answered here without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    void ctx.blockConcurrencyWhile(async () => {
      this.server = await ctx.storage.get<ServerState>(STORAGE_KEY);
    });
  }

  /** Creates the household from the first phone's state. Returns `null` if it already exists. */
  async create(household: unknown, fallbackWeek: string): Promise<{ version: number } | null> {
    if (this.server) return null;
    await this.save({ household: normalizeHousehold(household, fallbackWeek), version: 0, recent: [] });
    return { version: 0 };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/mcp") return this.mcp(request);
    const agents = url.pathname.match(/\/agents(?:\/([A-Za-z0-9_-]+))?$/);
    if (agents) return this.manageAgents(request, agents[1]);
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer) {
    if (!this.server) return this.reply(socket, { t: "unknown" }, true);
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    if (text.length > MAX_MESSAGE_BYTES) return socket.close(1009, "Message too large");
    let message: ClientMessage;
    try {
      message = JSON.parse(text) as ClientMessage;
    } catch {
      return socket.close(1007, "Invalid JSON");
    }

    if (message.t === "hello") {
      return this.reply(socket, { t: "snapshot", version: this.server.version, state: this.server.household });
    }
    if (message.t === "act") {
      const { server, reply } = applyOnServer(this.server, message);
      if (reply.t !== "applied") return this.reply(socket, reply);
      await this.save(server);
      for (const peer of this.ctx.getWebSockets()) this.reply(peer, reply);
    }
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string) {
    try {
      socket.close(code, reason);
    } catch {
      // Already closed.
    }
  }

  // ---------- Agents (remote MCP) ----------

  /** Members of the household (they have its key) create, list and revoke agent tokens. */
  private async manageAgents(request: Request, id: string | undefined): Promise<Response> {
    if (!this.server) return Response.json({ error: "unknown household" }, { status: 404 });
    const agents = (await this.ctx.storage.get<Agent[]>(AGENTS_KEY)) ?? [];
    const visible = (a: Agent) => ({ id: a.id, label: a.label, createdAt: a.createdAt, lastUsedAt: a.lastUsedAt });
    if (request.method === "GET" && !id) return Response.json(agents.map(visible));
    if (request.method === "POST" && !id) {
      if (agents.length >= MAX_AGENTS) return Response.json({ error: "too many agents" }, { status: 409 });
      const body = (await request.json().catch(() => ({}))) as { label?: unknown };
      const label = (typeof body.label === "string" ? body.label.trim() : "").slice(0, 40) || "Agent";
      const secret = randomId(32);
      const agent: Agent = { id: randomId(6), label, hash: await sha256(secret), createdAt: new Date().toISOString() };
      await this.ctx.storage.put(AGENTS_KEY, [...agents, agent]);
      // The token routes to this household without revealing its key; it's shown once and never stored.
      return Response.json({ ...visible(agent), token: `${this.ctx.id.toString()}.${secret}` }, { status: 201 });
    }
    if (request.method === "DELETE" && id) {
      await this.ctx.storage.put(AGENTS_KEY, agents.filter((a) => a.id !== id));
      return new Response(null, { status: 204 });
    }
    return new Response("Method not allowed", { status: 405 });
  }

  /** The household's tools over MCP, for an agent holding a token. Its changes reach the phones like their own. */
  private async mcp(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
    const [, secret] = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").split(".");
    const agents = (await this.ctx.storage.get<Agent[]>(AGENTS_KEY)) ?? [];
    const hash = secret ? await sha256(secret) : "";
    const agent = agents.find((a) => a.hash === hash);
    if (!agent || !this.server) return unauthorized();
    if (Number(request.headers.get("content-length") ?? 0) > MAX_MESSAGE_BYTES) return new Response("Too large", { status: 413 });
    const body = await request.json().catch(() => null);

    // Tools run on a working copy; their actions go through the same path as a phone's.
    let working = this.server;
    const applied: ServerMessage[] = [];
    const notices: string[] = [];
    const tools = createTools({
      getState: () => ({ ...working.household, swipes: [] }),
      dispatch: (action) => {
        if (action.type === "undo") return;
        const { server, reply } = applyOnServer(working, { id: crypto.randomUUID(), action });
        if (reply.t !== "applied") return;
        working = server;
        applied.push(reply);
      },
      notify: (text) => notices.push(text.replace(/^🤖 /, `🤖 ${agent.label} · `)),
      now: () => new Date(),
    });
    const result = await handleMcp(body, tools);

    if (applied.length) await this.save(working);
    for (const peer of this.ctx.getWebSockets()) {
      for (const message of applied) this.reply(peer, message);
      for (const text of notices) this.reply(peer, { t: "notice", text });
    }
    // Remember when an agent was last used (at most once an hour), to spot tokens worth revoking.
    const now = new Date();
    if (!agent.lastUsedAt || now.getTime() - Date.parse(agent.lastUsedAt) > 3_600_000) {
      await this.ctx.storage.put(AGENTS_KEY, agents.map((a) => (a.id === agent.id ? { ...a, lastUsedAt: now.toISOString() } : a)));
    }
    return result.json === undefined ? new Response(null, { status: result.status }) : Response.json(result.json, { status: result.status });
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
    this.server = undefined;
  }

  private async save(server: ServerState) {
    this.server = server;
    await this.ctx.storage.put(STORAGE_KEY, server);
    await this.ctx.storage.setAlarm(Date.now() + EXPIRY_MS);
  }

  private reply(socket: WebSocket, message: ServerMessage, close = false) {
    try {
      socket.send(JSON.stringify(message));
      if (close) socket.close(4404, "Unknown household");
    } catch {
      // The phone went away; it resyncs when it reconnects.
    }
  }
}
