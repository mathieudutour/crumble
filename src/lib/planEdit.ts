import type { Meal } from "../data/types";
import type { MealLookup } from "./catalogue";
import { fitsSlot, placeLeftovers, withPortions, type Diners, type Plan, type PlanSlot } from "./planning";

// Hand edits to a plan. A meal the household places itself is locked, so a redraw keeps it.

const FREE: PlanSlot = { kind: "free" };
const isFree = (slot: PlanSlot | undefined) => slot?.kind === "free";

/** Frees the leftovers fed by `from` and returns where they were. */
function detachLeftovers(slots: PlanSlot[], from: number): number[] {
  const freed: number[] = [];
  slots.forEach((slot, i) => {
    if (slot.kind === "leftovers" && slot.from === from) {
      slots[i] = FREE;
      freed.push(i);
    }
  });
  return freed;
}

export function toggleLock(plan: Plan, slot: number): Plan {
  return plan.map((entry, i) => (i === slot && entry.kind === "cook" ? { ...entry, locked: !entry.locked } : entry));
}

/** Cooks `meal` in `slot`. Its leftovers keep their place when both meals are batch meals. */
export function placeMeal(plan: Plan, slot: number, meal: Meal, diners: readonly Diners[], lookup: MealLookup): Plan {
  const slots = [...plan];
  const freed = detachLeftovers(slots, slot);
  slots[slot] = { kind: "cook", mealId: meal.id, portions: 0, factor: 1, locked: true };
  if (meal.batch && freed.length) {
    for (const i of freed) slots[i] = { kind: "leftovers", mealId: meal.id, from: slot };
  } else {
    placeLeftovers(slots, slot, meal, isFree);
  }
  return withPortions(slots, diners, lookup);
}

/** Empties a slot, and the leftovers it fed. */
export function clearSlot(plan: Plan, slot: number, diners: readonly Diners[], lookup: MealLookup): Plan {
  const slots = [...plan];
  detachLeftovers(slots, slot);
  slots[slot] = FREE;
  return withPortions(slots, diners, lookup);
}

/** A cooked meal can move to a free slot, or swap with another cooked meal, if both fit their new slot. */
export function canMove(plan: Plan, from: number, to: number, lookup: MealLookup): boolean {
  const source = plan[from];
  const target = plan[to];
  if (from === to || source?.kind !== "cook" || !target) return false;
  const meal = lookup(source.mealId);
  if (!meal || !fitsSlot(meal, to)) return false;
  if (target.kind === "free") return true;
  if (target.kind !== "cook") return false;
  const other = lookup(target.mealId);
  return !!other && fitsSlot(other, from);
}

/** Moves the meal cooked in `from` to `to`, swapping with what was there. Leftovers follow each meal's new day. */
export function moveMeal(plan: Plan, from: number, to: number, diners: readonly Diners[], lookup: MealLookup): Plan {
  if (!canMove(plan, from, to, lookup)) return plan;
  const slots = [...plan];
  const source = slots[from]!;
  const target = slots[to]!;
  detachLeftovers(slots, from);
  detachLeftovers(slots, to);
  slots[to] = { ...source, locked: true } as PlanSlot;
  slots[from] = target;
  for (const slot of [to, from]) {
    const entry = slots[slot];
    const meal = entry?.kind === "cook" ? lookup(entry.mealId) : undefined;
    if (meal) placeLeftovers(slots, slot, meal, isFree);
  }
  return withPortions(slots, diners, lookup);
}
