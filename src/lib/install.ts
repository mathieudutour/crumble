import { useSyncExternalStore } from "react";

// Browsers may clear a website's storage: Safari after about a week without a visit, Chrome when the phone runs out of
// space. Apps added to the home screen and storage marked persistent are spared, which matters most for a shared
// household, whose link lives in that storage.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

// Chrome and Edge offer installation through this event, once, early: keep it for our own button.
addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  notify();
});
addEventListener("appinstalled", () => {
  deferredPrompt = null;
  notify();
});

export const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhones and iPads (which report themselves as Macs with touch). */
const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export type InstallMethod = "prompt" | "ios" | "menu";

export interface Install {
  installed: boolean;
  /** `prompt`: the browser can install on a tap. `ios`: through Share › Sur l’écran d’accueil. `menu`: the browser menu. */
  method: InstallMethod;
  prompt: () => Promise<boolean>;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useInstall(): Install {
  const canPrompt = useSyncExternalStore(subscribe, () => !!deferredPrompt);
  return {
    installed: isStandalone(),
    method: canPrompt ? "prompt" : isIos() ? "ios" : "menu",
    prompt: async () => {
      const event = deferredPrompt;
      if (!event) return false;
      deferredPrompt = null;
      notify();
      await event.prompt();
      return (await event.userChoice).outcome === "accepted";
    },
  };
}

/** Asks the browser not to clear this site's storage. Some browsers decide silently; Firefox asks the user. */
export async function keepStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}
