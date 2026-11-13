import { AISLE_NAMES, AISLE_ORDER, aisleOf } from "../data/aisles";
import type { Aisle } from "../data/types";
import type { MealLookup } from "./catalogue";
import { formatQuantity } from "./format";
import { DAYS, scaleQuantity, type Plan } from "./planning";
import { addDays, fromIso } from "./week";

export interface ShoppingItem {
  /** Stable across plans, used to remember ticked items. */
  key: string;
  name: string;
  unit: string;
  quantity: number;
}

export type ShoppingList = { aisle: Aisle; items: ShoppingItem[] }[];

/** Sums every cooked meal's scaled ingredients, grouped by aisle. Leftovers cost nothing extra. */
export function shoppingList(plan: Plan, lookup: MealLookup): ShoppingList {
  const totals = new Map<string, ShoppingItem>();
  for (const slot of plan) {
    if (slot.kind !== "cook") continue;
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

export const planText = (plan: Plan, lookup: MealLookup, week: string) =>
  DAYS.map((_, d) => {
    const meals = [0, 1].map((dinner) => {
      const slot = plan[d * 2 + dinner];
      const label = dinner ? "Soir" : "Midi";
      const meal = slot?.kind === "cook" || slot?.kind === "leftovers" ? lookup(slot.mealId) : undefined;
      if (!slot || !meal) return `  ${label} : ${slot?.kind === "none" ? "dehors" : "libre"}`;
      return `  ${label} : ${slot.kind === "leftovers" ? "Restes – " : ""}${meal.name}`;
    });
    return [dayTitle(week, d), ...meals].join("\n");
  }).join("\n");
