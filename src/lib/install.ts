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

// Since iOS 17.2, adding to the home screen copies Safari's cookies, and nothing else, into the new app. Safari keeps
// the household key in a cookie too, so the app joins the same household on its first launch.
const KEY_COOKIE = "crumble-foyer";

/** In the browser: leaves the household key where an app added to the home screen finds it. */
export function handToInstall(key: string) {
  if (isStandalone() || readCookie(KEY_COOKIE) === key) return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${KEY_COOKIE}=${encodeURIComponent(key)}; Path=/; Max-Age=34560000; SameSite=Strict${secure}`;
}

/** In an app on the home screen: the key Safari left, if any. */
export function installedKey(): string | undefined {
  return isStandalone() ? readCookie(KEY_COOKIE) : undefined;
}

function readCookie(name: string): string | undefined {
  const value = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return value ? decodeURIComponent(value) : undefined;
}

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
