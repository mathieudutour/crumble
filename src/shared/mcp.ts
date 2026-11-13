// A remote MCP server (Streamable HTTP transport, stateless: every request is a POST answered with JSON), so agents
// outside the browser, like Hermes, can use the same tools the app registers with WebMCP (src/webmcp/tools.ts).
// Kept free of Worker APIs so it can be tested on its own; worker/household.ts serves it.

import type { Tool } from "../webmcp/tools";

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

const INSTRUCTIONS =
  "Crumble plans a household's lunches and dinners for the week from seasonal dishes they like, with leftovers, a shopping list and recipes. Days and meals are in French (lundi… dimanche, midi/soir). Start with get_week_plan or search_dishes. Changes show up on the household's phones right away.";

const isRequest = (value: unknown): value is JsonRpcRequest =>
  !!value &&
  typeof value === "object" &&
  (value as JsonRpcRequest).jsonrpc === "2.0" &&
  typeof (value as JsonRpcRequest).method === "string";

/** What the MCP spec calls tool annotations, from the WebMCP ones. */
const annotations = (tool: Tool) => ({
  title: tool.title,
  readOnlyHint: tool.annotations?.readOnlyHint ?? false,
  destructiveHint: tool.annotations?.consequentialHint ?? false,
  openWorldHint: false,
});

async function answer(request: JsonRpcRequest, tools: readonly Tool[]): Promise<JsonRpcResponse> {
  const id = request.id ?? null;
  const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

  switch (request.method) {
    case "initialize": {
      const asked = String(request.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "crumble", title: "Crumble", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({
        tools: tools.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: annotations(tool),
        })),
      });
    case "tools/call": {
      const tool = tools.find((t) => t.name === request.params?.name);
      if (!tool) return fail(-32602, `Unknown tool: ${String(request.params?.name)}`);
      const input = request.params?.arguments;
      try {
        const result = await tool.execute(input && typeof input === "object" ? (input as Record<string, unknown>) : {});
        return ok({
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          ...(result && typeof result === "object" && !Array.isArray(result) ? { structuredContent: result } : {}),
          isError: false,
        });
      } catch (error) {
        // Tool errors go back to the model so it can correct itself, rather than failing the request.
        return ok({
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        });
      }
    }
    default:
      return fail(-32601, `Method not found: ${request.method}`);
  }
}

/** Answers one HTTP POST body: a JSON-RPC request or notification. Notifications get no body (HTTP 202). */
export async function handleMcp(body: unknown, tools: readonly Tool[]): Promise<{ status: number; json?: unknown }> {
  if (!isRequest(body))
    return { status: 400, json: { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } } };
  if (body.id === undefined) return { status: 202 };
  return { status: 200, json: await answer(body, tools) };
}
