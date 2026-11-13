import { DurableObject } from "cloudflare:workers";
import { normalizeHousehold } from "../src/shared/household";
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
