import { describe, expect, it } from "vitest";
import type { Tool } from "../webmcp/tools";
import { handleMcp } from "./mcp";

const tools: Tool[] = [
  {
    name: "get_thing",
    title: "Get a thing",
    description: "Gets a thing.",
    inputSchema: { type: "object", properties: { id: { type: "string" } } },
    annotations: { readOnlyHint: true },
    execute: async (input) => ({ id: input.id, ok: true }),
  },
  {
    name: "break_thing",
    title: "Break a thing",
    description: "Always fails.",
    inputSchema: { type: "object" },
    annotations: { consequentialHint: true },
    execute: async () => {
      throw new Error("That thing can't be broken.");
    },
  },
];

const call = (method: string, params?: Record<string, unknown>) => handleMcp({ jsonrpc: "2.0", id: 1, method, params }, tools);
const notify = (method: string) => handleMcp({ jsonrpc: "2.0", method }, tools);

describe("remote MCP", () => {
  it("initializes with a protocol version the client knows", async () => {
    const { json } = await call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "hermes" },
    });
    expect(json).toMatchObject({
      result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "crumble" } },
    });
    const newer = await call("initialize", { protocolVersion: "2099-01-01" });
    expect((newer.json as { result: { protocolVersion: string } }).result.protocolVersion).toBe("2025-11-25");
  });

  it("accepts notifications without a body", async () => {
    expect(await notify("notifications/initialized")).toEqual({ status: 202 });
  });

  it("lists tools with MCP annotations", async () => {
    const { json } = await call("tools/list");
    expect(json).toMatchObject({
      result: {
        tools: [
          { name: "get_thing", annotations: { readOnlyHint: true, destructiveHint: false } },
          { name: "break_thing", annotations: { readOnlyHint: false, destructiveHint: true } },
        ],
      },
    });
  });

  it("calls a tool and returns text and structured content", async () => {
    const { json } = await call("tools/call", { name: "get_thing", arguments: { id: "x" } });
    expect(json).toMatchObject({
      result: { isError: false, structuredContent: { id: "x", ok: true }, content: [{ type: "text" }] },
    });
  });

  it("returns tool failures to the model rather than failing the request", async () => {
    const { json } = await call("tools/call", { name: "break_thing", arguments: {} });
    expect(json).toMatchObject({
      result: { isError: true, content: [{ type: "text", text: "That thing can't be broken." }] },
    });
  });

  it("rejects unknown tools, unknown methods and malformed requests", async () => {
    expect((await call("tools/call", { name: "nope" })).json).toMatchObject({ error: { code: -32602 } });
    expect((await call("resources/list")).json).toMatchObject({ error: { code: -32601 } });
    expect(await handleMcp({ hello: "world" }, tools)).toMatchObject({ status: 400 });
  });
});
