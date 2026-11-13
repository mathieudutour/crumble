import { FIXED_MEALS, MEALS } from "../data/meals";
import { RECIPES } from "../data/recipes";
import type { Meal } from "../data/types";

export type MealLookup = (id: string) => Meal | undefined;

/** Built-in dishes plus the household's own. */
export interface Catalogue {
  /** Meals that can be swiped and planned. */
  swipeable: readonly Meal[];
  /** Every meal, including those only booked as habits. */
  all: readonly Meal[];
  get: MealLookup;
}

export function makeCatalogue(custom: readonly Meal[] = []): Catalogue {
  const swipeable = [...MEALS, ...custom];
  const all = [...swipeable, ...Object.values(FIXED_MEALS)];
  const byId = new Map(all.map((meal) => [meal.id, meal]));
  return { swipeable, all, get: (id) => byId.get(id) };
}

export const recipeSteps = (meal: Meal): readonly string[] => meal.steps ?? RECIPES[meal.id] ?? [];
