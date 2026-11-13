import type { Catalogue } from "../lib/catalogue";
import { lockedSlots, makePlan } from "../lib/planning";
import { addDays, mondayOf } from "../lib/week";
import type { HouseholdAction } from "../shared/household";
import { fitsHousehold, likedMeals, planKey, preferencesOf } from "./selectors";
import type { AppState } from "./store";

/** History kept, in weeks. */
const HISTORY_WEEKS = 12;

/**
 * Draws the week being planned, keeping locked meals. Randomness stays out of the reducer, which also runs on the
 * server: the phone draws the plan and sends the result.
 */
export function drawPlan(state: AppState, catalogue: Catalogue, now = new Date()): HouseholdAction {
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
  return {
    type: "setPlan",
    week: state.week,
    slots,
    key: planKey(state, catalogue),
    keepFrom: addDays(mondayOf(now), -7 * HISTORY_WEEKS),
  };
}
