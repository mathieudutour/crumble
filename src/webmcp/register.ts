import type { AppStore } from "../store/store";
import { createTools, type Tool } from "./tools";

// WebMCP (https://webmachinelearning.github.io/webmcp/) lets a browser's AI agent call tools a page registers. The
// current draft puts the API on `document.modelContext`; earlier drafts and Chrome's preview used
// `navigator.modelContext`, and some polyfills return an `unregister()` handle instead of honouring the signal.

interface ModelContext {
  registerTool(tool: Tool, options?: { signal?: AbortSignal }): unknown;
}

const modelContext = (): ModelContext | undefined => {
  const candidates = [(document as { modelContext?: ModelContext }).modelContext, (navigator as { modelContext?: ModelContext }).modelContext];
  return candidates.find((context) => typeof context?.registerTool === "function");
};

/** Registers Crumble's tools where the browser supports WebMCP. Returns a function that removes them. */
export function registerWebMcp(store: AppStore): () => void {
  const context = modelContext();
  if (!context) return () => {};
  const controller = new AbortController();
  const handles: { unregister: () => void }[] = [];
  const tools = createTools({
    getState: store.getState,
    dispatch: store.dispatch,
    notify: (message) => store.onNotice?.(message),
    now: () => new Date(),
  });
  for (const tool of tools) {
    try {
      const result = context.registerTool(tool, { signal: controller.signal });
      if (result && typeof (result as { unregister?: unknown }).unregister === "function") handles.push(result as { unregister: () => void });
      else void Promise.resolve(result).catch((error) => console.warn(`WebMCP: couldn't register ${tool.name}`, error));
    } catch (error) {
      console.warn(`WebMCP: couldn't register ${tool.name}`, error);
    }
  }
  return () => {
    controller.abort();
    for (const handle of handles) handle.unregister();
  };
}
