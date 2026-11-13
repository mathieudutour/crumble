import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
// Registered first: browsers offer installation once, early in the page's life.
import "./lib/install";
import { App } from "./App";
import { TimersProvider } from "./components/Timers";
import { UiProvider } from "./components/UiProvider";
import { StoreProvider } from "./store/StoreProvider";
// Fonts are served with the app: no third-party request, and they work offline from the first visit.
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/inter/wght.css";
import "./styles.css";

// Offline support: the app shell and fonts are cached, so the shopping list works in a shop with no signal.
registerSW({ immediate: true });

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
