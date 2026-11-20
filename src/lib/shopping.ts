import { AISLE_NAMES, AISLE_ORDER, aisleOf } from "../data/aisles";
import type { Aisle } from "../data/types";
import type { MealLookup } from "./catalogue";
import { formatQuantity } from "./format";
import { DAYS, scaleQuantity, type Extra, type Plan } from "./planning";
import { addDays, fromIso } from "./week";

export interface ShoppingItem {
  /** Stable across plans, used to remember ticked items. */
  key: string;
  name: string;
  unit: string;
  quantity: number;
}

export type ShoppingList = { aisle: Aisle; items: ShoppingItem[] }[];

/**
 * Sums every cooked meal's scaled ingredients, grouped by aisle. Leftovers cost nothing extra. `extras` are the plan's
 * starters and desserts, from `extrasToCook`.
 */
export function shoppingList(
  plan: Plan,
  lookup: MealLookup,
  extras: readonly { mealId: string; factor: number }[] = [],
): ShoppingList {
  const totals = new Map<string, ShoppingItem>();
  const cooked = [...plan.flatMap((slot) => (slot.kind === "cook" ? [slot] : [])), ...extras];
  for (const slot of cooked) {
    for (const [name, quantity, unit] of lookup(slot.mealId)?.ingredients ?? []) {
      const key = `${name}|${unit}`;
      const item = totals.get(key) ?? { key, name, unit, quantity: 0 };
      item.quantity += scaleQuantity(quantity, unit, slot.factor);
      totals.set(key, item);
    }
  }
  return AISLE_ORDER.map((aisle) => ({
    aisle,
    items: [...totals.values()]
      .filter((item) => aisleOf(item.name) === aisle)
      .sort((a, b) => a.name.localeCompare(b.name, "fr")),
  })).filter((group) => group.items.length);
}

/** Splits off the ingredients the household always has at home. */
export function splitPantry(list: ShoppingList, pantry: Readonly<Record<string, boolean>>) {
  const atHome = list.flatMap(({ items }) => items.filter((item) => pantry[item.name]));
  const toBuy = list
    .map(({ aisle, items }) => ({ aisle, items: items.filter((item) => !pantry[item.name]) }))
    .filter((group) => group.items.length);
  return { toBuy, atHome };
}

export const shoppingText = (list: ShoppingList) =>
  list
    .map(({ aisle, items }) =>
      [AISLE_NAMES[aisle], ...items.map((x) => `- ${x.name} : ${formatQuantity(x.quantity, x.unit)}`)].join("\n"),
    )
    .join("\n\n");

export const dayTitle = (week: string, day: number) => `${DAYS[day]} ${fromIso(addDays(week, day)).getDate()}`;

export const planText = (plan: Plan, lookup: MealLookup, week: string, extras: readonly Extra[] = []) =>
  DAYS.map((_, d) => {
    const meals = [0, 1].map((dinner) => {
      const index = d * 2 + dinner;
      const slot = plan[index];
      const label = dinner ? "Soir" : "Midi";
      const meal = slot?.kind === "cook" || slot?.kind === "leftovers" ? lookup(slot.mealId) : undefined;
      const sides = extras
        .filter((e) => e.slot === index)
        .flatMap((e) => lookup(e.mealId)?.name ?? [])
        .map((name) => ` + ${name}`)
        .join("");
      if (!slot || !meal) return `  ${label} : ${slot?.kind === "none" ? "dehors" : "libre"}${sides}`;
      return `  ${label} : ${slot.kind === "leftovers" ? "Restes – " : ""}${meal.name}${sides}`;
    });
    return [dayTitle(week, d), ...meals].join("\n");
  }).join("\n");
