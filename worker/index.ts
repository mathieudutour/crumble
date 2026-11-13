// The Worker serves the static app (see `assets` in wrangler.jsonc) and the household API under /api.

export { Household } from "./household";

/** 128 random bits, URL-safe. Whoever has the key is part of the household. */
function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

const MAX_BODY_BYTES = 1024 * 1024;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/households" && request.method === "POST") {
      if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return json({ error: "too large" }, 413);
      const body = (await request.json().catch(() => null)) as { household?: unknown } | null;
      if (!body?.household) return json({ error: "missing household" }, 400);
      const key = newKey();
      const created = await env.HOUSEHOLD.get(env.HOUSEHOLD.idFromName(key)).create(
        body.household,
        new Date().toISOString().slice(0, 10),
      );
      if (!created) return json({ error: "conflict" }, 409);
      return json({ key, version: created.version }, 201);
    }

    const household = url.pathname.match(/^\/api\/households\/([A-Za-z0-9_-]{16,64})\/(sync|agents(?:\/[A-Za-z0-9_-]+)?)$/);
    if (household) return env.HOUSEHOLD.get(env.HOUSEHOLD.idFromName(household[1]!)).fetch(request);

    // Remote MCP for agents like Hermes. The token's first part names the household's Durable Object (not its key);
    // the object checks the rest.
    if (url.pathname === "/api/mcp") {
      const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const [objectId] = token.split(".");
      let id: DurableObjectId;
      try {
        id = env.HOUSEHOLD.idFromString(objectId ?? "");
      } catch {
        return Response.json(
          { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Missing or invalid Crumble agent token" } },
          { status: 401, headers: { "www-authenticate": 'Bearer realm="crumble"' } },
        );
      }
      return env.HOUSEHOLD.get(id).fetch(request);
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
