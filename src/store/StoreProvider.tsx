import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { makeCatalogue, type Catalogue } from "../lib/catalogue";
import { drawPlan } from "./plan";
import { getAppStore, type Action, type AppState, type AppStore, type SyncStatus } from "./store";


interface Store {
  state: AppState;
  status: SyncStatus;
  catalogue: Catalogue;
  dispatch: (action: Action) => void;
  /** Draws the week being planned again, keeping locked meals. */
  buildPlan: () => void;
  /** Sharing with the household: create, join, leave, invite. */
  household: AppStore;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const store = getAppStore();
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const status = useSyncExternalStore(store.subscribe, store.getStatus);
  const catalogue = useMemo(() => makeCatalogue(state.customMeals), [state.customMeals]);

  const buildPlan = useCallback(() => store.dispatch(drawPlan(state, catalogue)), [state, catalogue, store]);

  const value = useMemo(
    () => ({ state, status, catalogue, dispatch: store.dispatch, buildPlan, household: store }),
    [state, status, catalogue, store, buildPlan],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}
