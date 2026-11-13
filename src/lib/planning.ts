import type { Meal, Rating } from "../data/types";
import type { MealLookup } from "./catalogue";
import type { Random } from "./random";
import { parseMealTime } from "./time";

export interface Diners {
  adults: number;
  kids: number;
}

/**
 * A week is 14 slots: `day * 2` is lunch, `day * 2 + 1` is dinner, Monday first.
 * - `none`: nobody eats at home.
 * - `free`: nothing planned yet.
 * - `cook`: cook `mealId`, scaled to `portions` (leftovers included). `locked` survives a redraw; `habit` comes from
 *   the household's habits.
 * - `leftovers`: eat what was cooked in slot `from`.
 */
export type PlanSlot =
  | { kind: "none" }
  | { kind: "free" }
  | { kind: "cook"; mealId: string; portions: number; factor: number; locked?: boolean; habit?: boolean }
  | { kind: "leftovers"; mealId: string; from: number };

export type CookSlot = Extract<PlanSlot, { kind: "cook" }>;
export type Plan = PlanSlot[];

export const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
export const SLOT_COUNT = DAYS.length * 2;
export const slotIndex = (day: number, dinner: boolean) => day * 2 + (dinner ? 1 : 0);
export const dayOf = (slot: number) => Math.floor(slot / 2);
export const isDinnerSlot = (slot: number) => slot % 2 === 1;
export const isWeekendSlot = (slot: number) => dayOf(slot) >= 5;
export const isWeeknightDinner = (slot: number) => isDinnerSlot(slot) && !isWeekendSlot(slot);
export const slotName = (slot: number) => `${DAYS[dayOf(slot)]!.toLowerCase()} ${isDinnerSlot(slot) ? "soir" : "midi"}`;

const FREE: PlanSlot = { kind: "free" };
const NOBODY: Diners = { adults: 0, kids: 0 };

/** A child eats half an adult portion. */
export const KID_PORTION = 0.5;
export const portionsOf = ({ adults, kids }: Diners) => adults + KID_PORTION * kids;

/** Two adults every meal, plus a child at dinner and all weekend. */
export const defaultDiners = (): Diners[] =>
  Array.from({ length: SLOT_COUNT }, (_, slot) => ({
    adults: 2,
    kids: isDinnerSlot(slot) || isWeekendSlot(slot) ? 1 : 0,
  }));

/** A meal the household always has in a given slot. */
export interface Habit {
  slot: number;
  mealId: string;
}

export const DEFAULT_HABITS: readonly Habit[] = [
  { slot: slotIndex(2, true), mealId: "pesto" },
  { slot: slotIndex(6, true), mealId: "crepes" },
];

/** Portions the recipe's listed quantities make. */
export function baseServings(meal: Meal): number {
  if (meal.type === "fixed") return 2.5;
  if (meal.quiche) return 6;
  if (meal.batch) return meal.type === "lunch" ? 4 : 5;
  return meal.type === "lunch" ? 2 : 2.5;
}

/** Multiplier applied to the recipe's quantities. Quiches only scale by whole quiches. */
export function scaleFactor(meal: Meal, portions: number): number {
  if (meal.quiche) return Math.max(1, Math.ceil(portions / 6));
  return Math.max(0.5, Math.round((portions / baseServings(meal)) * 4) / 4);
}

/** Scales a quantity and rounds it to something you can buy or measure. */
export function scaleQuantity(quantity: number, unit: string, factor: number): number {
  if (factor === 1) return quantity;
  const value = quantity * factor;
  if (unit === "g") {
    const step = value > 200 ? 50 : 10;
    return Math.max(10, Math.round(value / step) * step);
  }
  if (unit === "cl") return Math.max(5, Math.round(value / 5) * 5);
  if (!Number.isInteger(quantity)) return Math.max(0.5, Math.round(value * 2) / 2);
  return Math.max(1, Math.round(value));
}

export const fitsSlot = (meal: Meal, slot: number) =>
  meal.type === "fixed" || meal.type === "either" || (meal.type === "dinner") === isDinnerSlot(slot);

/** Too long to cook on a weekday evening. */
export const isTooLong = (meal: Meal, slot: number, weeknightMinutes: number | null) =>
  weeknightMinutes !== null && isWeeknightDinner(slot) && parseMealTime(meal.time).total > weeknightMinutes;

/** Slots a batch meal's leftovers can go to, in order of preference. */
export const leftoverTargets = (slot: number) =>
  isDinnerSlot(slot)
    ? [slot + 1, slot + 2] // next day's lunch, else next day's dinner
    : [slot + 2]; // next day's lunch

/** Books a batch meal's leftovers in its first matching free slot, if any. */
export function placeLeftovers(
  slots: (PlanSlot | undefined)[],
  from: number,
  meal: Meal,
  isOpen: (slot: PlanSlot | undefined) => boolean,
) {
  if (!meal.batch) return;
  const target = leftoverTargets(from).find((t) => t < SLOT_COUNT && isOpen(slots[t]));
  if (target !== undefined) slots[target] = { kind: "leftovers", mealId: meal.id, from };
}

/** Recomputes how much each cooked meal must make: its own slot plus the leftovers it feeds. */
export function withPortions(slots: readonly PlanSlot[], diners: readonly Diners[], lookup: MealLookup): Plan {
  const portions = (slot: number) => portionsOf(diners[slot] ?? NOBODY);
  return slots.map((entry, slot) => {
    if (entry.kind !== "cook") return entry;
    let total = portions(slot);
    slots.forEach((other, otherSlot) => {
      if (other.kind === "leftovers" && other.from === slot) total += portions(otherSlot);
    });
    const meal = lookup(entry.mealId);
    return { ...entry, portions: total, factor: meal ? scaleFactor(meal, total) : 1 };
  });
}

/** Slots a redraw keeps: locked meals and their leftovers. */
export const lockedSlots = (plan: Plan): (PlanSlot | undefined)[] =>
  plan.map((slot) => {
    if (slot.kind === "cook" && slot.locked) return slot;
    if (slot.kind === "leftovers") {
      const source = plan[slot.from];
      if (source?.kind === "cook" && source.locked && source.mealId === slot.mealId) return slot;
    }
    return undefined;
  });

export interface Preferences {
  /** Longest weekday dinner, in minutes; `null` for no limit. */
  weeknightMinutes: number | null;
  /** Days since meals eaten recently were last eaten. */
  recent: ReadonlyMap<string, number>;
  ratings: Readonly<Record<string, Rating>>;
  kidsLike: Readonly<Record<string, boolean>>;
}

export interface PlanInput {
  /** Liked meals available this week. */
  candidates: readonly Meal[];
  diners: readonly Diners[];
  habits: readonly Habit[];
  preferences: Preferences;
  lookup: MealLookup;
  /** Slots to keep as they are, from `lockedSlots`. */
  keep?: readonly (PlanSlot | undefined)[];
  random?: Random;
}

/** Ingredients too common to make two meals feel alike. */
const STAPLES = new Set([
  "Lait",
  "Beurre",
  "Farine",
  "Crème fraîche",
  "Œufs",
  "Oignons",
  "Échalotes",
  "Salade verte",
  "Pâte brisée",
  "Bouillon de légumes",
  "Parmesan",
  "Emmental râpé",
  "Citrons",
]);

const sharedIngredients = (a: Meal, b: Meal) => {
  const names = new Set(a.ingredients.map(([name]) => name).filter((name) => !STAPLES.has(name)));
  return b.ingredients.filter(([name]) => names.has(name)).length;
};

/**
 * Builds a week, slot by slot in order, picking the best-scoring liked meal for each:
 * - every meal once before any repeats;
 * - long meals kept off weekday evenings, and nudged to the weekend;
 * - no two meals sharing main ingredients close together, and no quiche two lunches running;
 * - meals eaten in the last weeks pushed back, favourites and the kids' favourites pulled forward.
 * Habits are booked first; batch meals book their leftovers in the next matching slot.
 */
export function makePlan({
  candidates,
  diners,
  habits,
  preferences,
  lookup,
  keep = [],
  random = Math.random,
}: PlanInput): Plan {
  const eats = (slot: number) => portionsOf(diners[slot] ?? NOBODY) > 0;
  const slots: (PlanSlot | undefined)[] = Array.from({ length: SLOT_COUNT }, (_, slot) =>
    eats(slot) ? keep[slot] : { kind: "none" },
  );

  // Kept leftovers whose cooking slot was dropped have nothing to eat.
  slots.forEach((slot, i) => {
    if (slot?.kind !== "leftovers") return;
    const source = slots[slot.from];
    if (source?.kind !== "cook" || source.mealId !== slot.mealId) slots[i] = undefined;
  });

  for (const habit of habits) {
    if (!slots[habit.slot] && lookup(habit.mealId)) {
      slots[habit.slot] = { kind: "cook", mealId: habit.mealId, portions: 0, factor: 1, habit: true };
    }
  }

  const mealAt = (slot: number) => {
    const entry = slots[slot];
    return entry?.kind === "cook" || entry?.kind === "leftovers" ? lookup(entry.mealId) : undefined;
  };
  const timesUsed = (id: string) => slots.filter((s) => s?.kind === "cook" && s.mealId === id).length;

  const score = (meal: Meal, slot: number) => {
    let score = random() * 5;
    score -= timesUsed(meal.id) * 100;
    const { weeknightMinutes, recent, ratings, kidsLike } = preferences;
    if (weeknightMinutes !== null && parseMealTime(meal.time).total > weeknightMinutes) {
      if (isWeeknightDinner(slot)) score -= 50;
      else if (isWeekendSlot(slot)) score += 3;
    }
    for (const offset of [-2, -1, 1, 2]) {
      const neighbour = mealAt(slot + offset);
      if (neighbour && neighbour.id !== meal.id) score -= 3 * sharedIngredients(meal, neighbour);
    }
    if (meal.quiche && !isDinnerSlot(slot) && mealAt(slot - 2)?.quiche) score -= 8;
    const daysAgo = recent.get(meal.id);
    if (daysAgo !== undefined) score -= daysAgo <= 7 ? 10 : 5;
    if (ratings[meal.id] === 1) score += 4;
    if (ratings[meal.id] === -1) score -= 10;
    if (kidsLike[meal.id] && (diners[slot]?.kids ?? 0) > 0) score += 3;
    return score;
  };

  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    if (slots[slot]) continue;
    let best: Meal | undefined;
    let bestScore = -Infinity;
    for (const meal of candidates) {
      if (meal.type === "fixed" || !fitsSlot(meal, slot)) continue;
      const s = score(meal, slot);
      if (s > bestScore) [best, bestScore] = [meal, s];
    }
    if (!best) {
      slots[slot] = FREE;
      continue;
    }
    slots[slot] = { kind: "cook", mealId: best.id, portions: 0, factor: 1 };
    placeLeftovers(slots, slot, best, (s) => !s);
  }

  return withPortions(
    slots.map((s) => s ?? FREE),
    diners,
    lookup,
  );
}

export const hasLeftovers = (plan: Plan, slot: number) => plan.some((s) => s.kind === "leftovers" && s.from === slot);
