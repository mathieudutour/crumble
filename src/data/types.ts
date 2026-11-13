/** `[name, quantity, unit]`. The unit is singular ("botte"), or empty for countable items ("3 œufs"). */
export type Ingredient = readonly [name: string, quantity: number, unit: string];

/**
 * - `dinner` and `lunch` only fill that slot.
 * - `either` can fill a lunch or a dinner.
 * - `fixed` meals are only booked through household habits, never swiped.
 */
export type MealType = "dinner" | "lunch" | "either" | "fixed";

export interface Meal {
  id: string;
  emoji: string;
  name: string;
  type: MealType;
  /** Display label, also parsed for planning: "1 h 15 (20 min actif)". */
  time: string;
  /** Cooked in a double batch: the planner books a leftovers meal right after. */
  batch?: boolean;
  /** One quiche makes 6 slices, so quantities scale by whole quiches. */
  quiche?: boolean;
  ingredients: readonly Ingredient[];
  /** Months (1–12) the meal is in season. */
  months: readonly number[];
  /** For the household's own and edited dishes; built-in recipes live in `RECIPES`. */
  steps?: readonly string[];
  /** Added by the household. */
  custom?: boolean;
  /** The household's version of a built-in dish, replacing it (same id) until they reset it. */
  edited?: boolean;
}

export type Aisle = "produce" | "meat" | "dairy" | "grocery";

/** 1: a favourite. -1: tried and not liked. */
export type Rating = 1 | -1;
