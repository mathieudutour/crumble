import { useCallback, useEffect, useSyncExternalStore } from "react";

export const VIEWS = [
  { id: "swipe", hash: "choisir", label: "Choisir" },
  { id: "plan", hash: "planning", label: "Planning" },
  { id: "shop", hash: "courses", label: "Courses" },
  { id: "recipes", hash: "recettes", label: "Recettes" },
  { id: "home", hash: "foyer", label: "Foyer" },
] as const;

export type ViewId = (typeof VIEWS)[number]["id"];

export const hrefOf = (view: ViewId) => `#${VIEWS.find((v) => v.id === view)!.hash}`;

/** Earlier names of tabs, so old links and bookmarks still land on them. */
const RENAMED: Record<string, ViewId> = { "#plats": "recipes" };

const readView = (): ViewId =>
  VIEWS.find((v) => `#${v.hash}` === location.hash)?.id ?? RENAMED[location.hash] ?? "swipe";

const subscribe = (onChange: () => void) => {
  addEventListener("hashchange", onChange);
  return () => removeEventListener("hashchange", onChange);
};

/** The current tab lives in the URL hash so tabs can be linked, bookmarked and navigated with Back. */
export function useView(): [ViewId, (view: ViewId) => void] {
  const view = useSyncExternalStore(subscribe, readView);
  // In braces: newer Chrome makes scrollTo return a promise, which React would take for a cleanup function and crash.
  useEffect(() => {
    scrollTo(0, 0);
  }, [view]);
  const navigate = useCallback((next: ViewId) => {
    location.hash = hrefOf(next);
  }, []);
  return [view, navigate];
}
