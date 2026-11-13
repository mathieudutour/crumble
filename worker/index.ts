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

    const sync = url.pathname.match(/^\/api\/households\/([A-Za-z0-9_-]{16,64})\/sync$/);
    if (sync) return env.HOUSEHOLD.get(env.HOUSEHOLD.idFromName(sync[1]!)).fetch(request);

    if (url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
