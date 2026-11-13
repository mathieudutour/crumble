import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
// Registered first: browsers offer installation once, early in the page's life.
import "./lib/install";
import { App } from "./App";
import { TimersProvider } from "./components/Timers";
import { UiProvider } from "./components/UiProvider";
import { StoreProvider } from "./store/StoreProvider";
import { getAppStore } from "./store/store";
import { registerWebMcp } from "./webmcp/register";
import "./styles.css";

// Offline support: the app shell and fonts are cached, so the shopping list works in a shop with no signal.
registerSW({ immediate: true });

// Lets AI agents in the browser use Crumble (plan, shop, set up the household) where WebMCP is supported.
registerWebMcp(getAppStore());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <TimersProvider>
        <UiProvider>
          <App />
        </UiProvider>
      </TimersProvider>
    </StoreProvider>
  </StrictMode>,
);
