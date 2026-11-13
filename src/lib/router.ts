import { useCallback, useEffect, useSyncExternalStore } from "react";

export const VIEWS = [
  { id: "swipe", hash: "choisir", label: "Choisir" },
  { id: "plan", hash: "planning", label: "Planning" },
  { id: "shop", hash: "courses", label: "Courses" },
  { id: "mine", hash: "plats", label: "Plats" },
  { id: "home", hash: "foyer", label: "Foyer" },
] as const;

export type ViewId = (typeof VIEWS)[number]["id"];

export const hrefOf = (view: ViewId) => `#${VIEWS.find((v) => v.id === view)!.hash}`;

const readView = (): ViewId => VIEWS.find((v) => `#${v.hash}` === location.hash)?.id ?? "swipe";

const subscribe = (onChange: () => void) => {
  addEventListener("hashchange", onChange);
  return () => removeEventListener("hashchange", onChange);
};

/** The current tab lives in the URL hash so tabs can be linked, bookmarked and navigated with Back. */
export function useView(): [ViewId, (view: ViewId) => void] {
  const view = useSyncExternalStore(subscribe, readView);
  useEffect(() => scrollTo(0, 0), [view]);
  const navigate = useCallback((next: ViewId) => {
    location.hash = hrefOf(next);
  }, []);
  return [view, navigate];
}
