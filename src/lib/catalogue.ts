import { FIXED_MEALS, MEALS } from "../data/meals";
import { RECIPES } from "../data/recipes";
import type { Course, Meal } from "../data/types";

export type MealLookup = (id: string) => Meal | undefined;

const BUILT_IN = new Map([...MEALS, ...Object.values(FIXED_MEALS)].map((meal) => [meal.id, meal as Meal]));

/** The dish as the app ships it, before any household edit. */
export const builtInMeal = (id: string): Meal | undefined => BUILT_IN.get(id);

export const courseOf = (meal: Meal): Course => meal.course ?? "plat";

/** Built-in dishes (with the household's edits) plus the household's own. */
export interface Catalogue {
  /** Main dishes that can be swiped and planned. */
  swipeable: readonly Meal[];
  /** Every dish, including those only booked as habits, and starters and desserts. */
  all: readonly Meal[];
  get: MealLookup;
}

export function makeCatalogue(custom: readonly Meal[] = []): Catalogue {
  // The household's version of a built-in dish takes its place; their own dishes come after.
  const edits = new Map(custom.filter((m) => BUILT_IN.has(m.id)).map((m) => [m.id, m]));
  const own = custom.filter((m) => !BUILT_IN.has(m.id));
  const swipeable = [...MEALS.map((m) => edits.get(m.id) ?? m), ...own.filter((m) => !m.course)];
  const all = [
    ...swipeable,
    ...own.filter((m) => m.course),
    ...Object.values(FIXED_MEALS).map((m) => edits.get(m.id) ?? m),
  ];
  const byId = new Map(all.map((meal) => [meal.id, meal]));
  return { swipeable, all, get: (id) => byId.get(id) };
}

export const recipeSteps = (meal: Meal): readonly string[] => meal.steps ?? RECIPES[meal.id] ?? [];
