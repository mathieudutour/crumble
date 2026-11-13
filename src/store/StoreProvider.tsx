import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { makeCatalogue, type Catalogue } from "../lib/catalogue";
import { lockedSlots, makePlan } from "../lib/planning";
import { addDays, mondayOf } from "../lib/week";
import { fitsHousehold, likedMeals, planKey, preferencesOf } from "./selectors";
import { getAppStore, type Action, type AppState, type AppStore, type SyncStatus } from "./store";

/** History kept, in weeks. */
const HISTORY_WEEKS = 12;

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

  // Randomness stays out of the reducer, which also runs on the server: the phone draws the plan and sends it.
  const buildPlan = useCallback(() => {
    const current = state.plans[state.week];
    const slots = makePlan({
      candidates: likedMeals(state, catalogue),
      diners: state.diners,
      // A habit is skipped while its dish doesn't fit the household (an allergy, a diet).
      habits: state.settings.habits.filter((h) => {
        const meal = catalogue.get(h.mealId);
        return !!meal && fitsHousehold(state, meal);
      }),
      preferences: preferencesOf(state),
      lookup: catalogue.get,
      // Locked meals stay, unless the household now avoids them.
      keep: current
        ? lockedSlots(current.slots).map((slot) => {
            const meal = slot && "mealId" in slot ? catalogue.get(slot.mealId) : undefined;
            return meal && !fitsHousehold(state, meal) ? undefined : slot;
          })
        : [],
    });
    store.dispatch({
      type: "setPlan",
      week: state.week,
      slots,
      key: planKey(state, catalogue),
      keepFrom: addDays(mondayOf(new Date()), -7 * HISTORY_WEEKS),
    });
  }, [state, catalogue, store]);

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
