// The household's shared state and the actions that change it. This runs on the phones and in the household's
// Durable Object, so it must stay pure and deterministic: no randomness, no clock, no browser APIs. Anything random
// (a shuffled deck, a drawn plan) is computed by the phone and carried in the action.

import { NO_DIET, type Diet } from "../data/diet";
import type { Meal, Rating } from "../data/types";
import { makeCatalogue, type MealLookup } from "../lib/catalogue";
import { clearSlot, moveMeal, placeMeal } from "../lib/planEdit";
import {
  DEFAULT_HABITS,
  defaultDiners,
  SLOT_COUNT,
  withPortions,
  type Diners,
  type Habit,
  type Plan,
  type PlanSlot,
} from "../lib/planning";

export interface WeekPlan {
  slots: Plan;
  /** Inputs the plan was drawn from (see `planKey`), to flag a stale plan. */
  key: string;
  /** Ticked shopping items, by `ShoppingItem.key`. */
  checked: Record<string, boolean>;
}

export interface Settings {
  habits: Habit[];
  diet: Diet;
  /** Ingredients the household avoids (dislike or allergy): meals containing them are left out. */
  avoid: string[];
  /** Longest weekday dinner, in minutes; `null` for no limit. */
  weeknightMinutes: number | null;
}

export interface Household {
  /** Deck order, shuffled once so the deck is stable across visits. Meals missing from it go last. */
  order: string[];
  liked: string[];
  noped: string[];
  /** Monday of the week being planned: this week or the next. */
  week: string;
  /** Plans by Monday. Past weeks are the household's history. */
  plans: Record<string, WeekPlan>;
  diners: Diners[];
  settings: Settings;
  /** Ingredients always at home, left off the shopping list. */
  pantry: Record<string, boolean>;
  ratings: Record<string, Rating>;
  kidsLike: Record<string, boolean>;
  customMeals: Meal[];
}

export type DinersField = keyof Diners;

/** Actions say the value they want rather than toggling, so two people acting at once never cancel each other. */
export type HouseholdAction =
  | { type: "swipe"; id: string; liked: boolean }
  | { type: "unswipe"; id: string }
  | { type: "reviewNoped" }
  | { type: "unlike"; id: string }
  | { type: "like"; id: string }
  | { type: "setWeek"; week: string }
  /** A freshly drawn plan. Plans of weeks before `keepFrom` are dropped from the history. */
  | { type: "setPlan"; week: string; slots: Plan; key: string; keepFrom: string }
  | { type: "placeMeal"; week: string; slot: number; mealId: string }
  | { type: "moveMeal"; week: string; from: number; to: number }
  | { type: "clearSlot"; week: string; slot: number }
  | { type: "setLock"; week: string; slot: number; locked: boolean }
  | { type: "setChecked"; week: string; key: string; value: boolean }
  | { type: "clearChecked"; week: string }
  | { type: "setPantry"; name: string; value: boolean }
  | { type: "setDiners"; slot: number; field: DinersField; value: number }
  | { type: "resetDiners" }
  | { type: "setSettings"; settings: Partial<Settings> }
  | { type: "rate"; id: string; rating: Rating | null }
  | { type: "setKidsLike"; id: string; value: boolean }
  | { type: "saveMeal"; meal: Meal }
  | { type: "deleteMeal"; id: string }
  /** Every dish back in the deck, in the given order. */
  | { type: "resetChoices"; order: string[] };

const MAX_DINERS = 12;

export const defaultSettings = (): Settings => ({
  habits: [...DEFAULT_HABITS],
  diet: { ...NO_DIET },
  avoid: [],
  weeknightMinutes: 45,
});

export const freshHousehold = (order: string[], week: string): Household => ({
  order,
  liked: [],
  noped: [],
  week,
  plans: {},
  diners: defaultDiners(),
  settings: defaultSettings(),
  pantry: {},
  ratings: {},
  kidsLike: {},
  customMeals: [],
});

// ---------- Validation (stored data and data from other phones are untrusted) ----------

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const strings = (value: unknown) => (Array.isArray(value) ? value.filter(isString) : []);
const flags = (value: unknown): Record<string, boolean> =>
  isObject(value) ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, true] => entry[1] === true)) : {};
const isSlotIndex = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < SLOT_COUNT;
const isWeek = (value: unknown): value is string => isString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function isMeal(value: unknown): value is Meal {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.emoji) &&
    isString(value.time) &&
    ["dinner", "lunch", "either"].includes(value.type as string) &&
    Array.isArray(value.ingredients) &&
    value.ingredients.every((i) => Array.isArray(i) && isString(i[0]) && typeof i[1] === "number" && isString(i[2])) &&
    Array.isArray(value.months) &&
    value.months.every((m) => Number.isInteger(m))
  );
}

function isSlot(value: unknown): value is PlanSlot {
  if (!isObject(value)) return false;
  switch (value.kind) {
    case "none":
    case "free":
      return true;
    case "cook":
      return isString(value.mealId) && typeof value.portions === "number" && typeof value.factor === "number";
    case "leftovers":
      return isString(value.mealId) && isSlotIndex(value.from);
    default:
      return false;
  }
}

const isPlan = (value: unknown): value is Plan =>
  Array.isArray(value) && value.length === SLOT_COUNT && value.every(isSlot);

/** Slots pointing at meals that no longer exist become free. */
const cleanSlots = (slots: Plan, lookup: MealLookup): Plan =>
  slots.map((slot) => ("mealId" in slot && !lookup(slot.mealId) ? { kind: "free" } : slot));

function normalizeSettings(value: unknown, lookup: MealLookup): Settings {
  const settings = isObject(value) ? value : {};
  const habits = Array.isArray(settings.habits)
    ? settings.habits.filter(
        (h): h is Habit => isObject(h) && isSlotIndex(h.slot) && isString(h.mealId) && !!lookup(h.mealId),
      )
    : [...DEFAULT_HABITS];
  return {
    habits,
    diet: { ...NO_DIET, ...(isObject(settings.diet) ? flags(settings.diet) : {}) },
    avoid: strings(settings.avoid),
    weeknightMinutes:
      settings.weeknightMinutes === null || typeof settings.weeknightMinutes === "number"
        ? settings.weeknightMinutes
        : 45,
  };
}

/** A valid household from stored or received data, with defaults for anything missing or malformed. */
export function normalizeHousehold(value: unknown, fallbackWeek: string): Household {
  const stored = isObject(value) ? value : {};
  const customMeals = Array.isArray(stored.customMeals)
    ? stored.customMeals.filter(isMeal).map((m) => ({ ...m, custom: true }))
    : [];
  const lookup = makeCatalogue(customMeals).get;
  const known = (ids: unknown) => strings(ids).filter((id) => lookup(id));
  const plans: Record<string, WeekPlan> = {};
  for (const [week, plan] of Object.entries(isObject(stored.plans) ? stored.plans : {})) {
    if (!isWeek(week) || !isObject(plan) || !isPlan(plan.slots)) continue;
    plans[week] = {
      slots: cleanSlots(plan.slots, lookup),
      key: isString(plan.key) ? plan.key : "",
      checked: flags(plan.checked),
    };
  }
  const diners = Array.isArray(stored.diners) && stored.diners.length === SLOT_COUNT ? stored.diners : [];
  return {
    order: known(stored.order),
    liked: known(stored.liked),
    noped: known(stored.noped),
    week: isWeek(stored.week) ? stored.week : fallbackWeek,
    plans,
    diners:
      diners.every((d) => isObject(d) && Number.isInteger(d.adults) && Number.isInteger(d.kids)) && diners.length
        ? (diners as Diners[])
        : defaultDiners(),
    settings: normalizeSettings(stored.settings, lookup),
    pantry: flags(stored.pantry),
    ratings: isObject(stored.ratings)
      ? (Object.fromEntries(Object.entries(stored.ratings).filter(([, r]) => r === 1 || r === -1)) as Record<
          string,
          Rating
        >)
      : {},
    kidsLike: flags(stored.kidsLike),
    customMeals,
  };
}

const ACTION_TYPES = new Set<HouseholdAction["type"]>([
  "swipe",
  "unswipe",
  "reviewNoped",
  "unlike",
  "like",
  "setWeek",
  "setPlan",
  "placeMeal",
  "moveMeal",
  "clearSlot",
  "setLock",
  "setChecked",
  "clearChecked",
  "setPantry",
  "setDiners",
  "resetDiners",
  "setSettings",
  "rate",
  "setKidsLike",
  "saveMeal",
  "deleteMeal",
  "resetChoices",
]);

/** Shape check for actions received from another phone. The reducer also ignores values it can't apply. */
export function isHouseholdAction(value: unknown): value is HouseholdAction {
  return isObject(value) && ACTION_TYPES.has(value.type as HouseholdAction["type"]);
}

// ---------- Reducer ----------

const without = (ids: string[], id: string) => ids.filter((x) => x !== id);
const withoutKey = <T>(record: Record<string, T>, key: string) =>
  Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
const setFlag = (record: Record<string, boolean>, key: string, value: boolean) =>
  value ? { ...record, [key]: true } : withoutKey(record, key);

function updatePlan(state: Household, week: string, update: (plan: WeekPlan) => WeekPlan): Household {
  const plan = state.plans[week];
  return plan ? { ...state, plans: { ...state.plans, [week]: update(plan) } } : state;
}

export function householdReducer(state: Household, action: HouseholdAction): Household {
  const lookup = () => makeCatalogue(state.customMeals).get;
  switch (action.type) {
    case "swipe":
    case "like":
    case "unlike": {
      if (!isString(action.id)) return state;
      const liked = action.type === "like" || (action.type === "swipe" && action.liked === true);
      return {
        ...state,
        liked: liked ? [...without(state.liked, action.id), action.id] : without(state.liked, action.id),
        noped: liked ? without(state.noped, action.id) : [...without(state.noped, action.id), action.id],
      };
    }
    case "unswipe":
      return { ...state, liked: without(state.liked, action.id), noped: without(state.noped, action.id) };
    case "reviewNoped":
      return { ...state, noped: [] };
    case "setWeek":
      return isWeek(action.week) ? { ...state, week: action.week } : state;
    case "setPlan": {
      if (!isWeek(action.week) || !isPlan(action.slots)) return state;
      const kept = Object.entries(state.plans).filter(([week]) => !isWeek(action.keepFrom) || week >= action.keepFrom);
      return {
        ...state,
        plans: {
          ...Object.fromEntries(kept),
          [action.week]: { slots: action.slots, key: isString(action.key) ? action.key : "", checked: {} },
        },
      };
    }
    case "placeMeal": {
      const meal = lookup()(action.mealId);
      if (!meal || !isSlotIndex(action.slot)) return state;
      return updatePlan(state, action.week, (plan) => ({
        ...plan,
        slots: placeMeal(plan.slots, action.slot, meal, state.diners, lookup()),
      }));
    }
    case "moveMeal":
      if (!isSlotIndex(action.from) || !isSlotIndex(action.to)) return state;
      return updatePlan(state, action.week, (plan) => ({
        ...plan,
        slots: moveMeal(plan.slots, action.from, action.to, state.diners, lookup()),
      }));
    case "clearSlot":
      if (!isSlotIndex(action.slot)) return state;
      return updatePlan(state, action.week, (plan) => ({
        ...plan,
        slots: clearSlot(plan.slots, action.slot, state.diners, lookup()),
      }));
    case "setLock":
      return updatePlan(state, action.week, (plan) => ({
        ...plan,
        slots: plan.slots.map((slot, i) =>
          i === action.slot && slot.kind === "cook" ? { ...slot, locked: action.locked === true } : slot,
        ),
      }));
    case "setChecked":
      if (!isString(action.key)) return state;
      return updatePlan(state, action.week, (plan) => ({
        ...plan,
        checked: setFlag(plan.checked, action.key, action.value === true),
      }));
    case "clearChecked":
      return updatePlan(state, action.week, (plan) => ({ ...plan, checked: {} }));
    case "setPantry":
      return isString(action.name)
        ? { ...state, pantry: setFlag(state.pantry, action.name, action.value === true) }
        : state;
    case "setDiners": {
      if (
        !isSlotIndex(action.slot) ||
        (action.field !== "adults" && action.field !== "kids") ||
        !Number.isFinite(action.value)
      )
        return state;
      const value = Math.max(0, Math.min(MAX_DINERS, Math.round(action.value)));
      return {
        ...state,
        diners: state.diners.map((d, slot) => (slot === action.slot ? { ...d, [action.field]: value } : d)),
      };
    }
    case "resetDiners":
      return { ...state, diners: defaultDiners() };
    case "setSettings":
      return {
        ...state,
        settings: normalizeSettings(
          { ...state.settings, ...(isObject(action.settings) ? action.settings : {}) },
          lookup(),
        ),
      };
    case "rate":
      if (!isString(action.id)) return state;
      return {
        ...state,
        ratings:
          action.rating === 1 || action.rating === -1
            ? { ...state.ratings, [action.id]: action.rating }
            : withoutKey(state.ratings, action.id),
      };
    case "setKidsLike":
      return isString(action.id)
        ? { ...state, kidsLike: setFlag(state.kidsLike, action.id, action.value === true) }
        : state;
    case "saveMeal": {
      if (!isMeal(action.meal)) return state;
      const meal: Meal = { ...action.meal, custom: true };
      if (state.customMeals.some((m) => m.id === meal.id))
        return { ...state, customMeals: state.customMeals.map((m) => (m.id === meal.id ? meal : m)) };
      // A dish the household adds is one they like.
      return {
        ...state,
        customMeals: [...state.customMeals, meal],
        order: [meal.id, ...without(state.order, meal.id)],
        liked: [...without(state.liked, meal.id), meal.id],
      };
    }
    case "deleteMeal": {
      if (!state.customMeals.some((m) => m.id === action.id)) return state;
      const customMeals = state.customMeals.filter((m) => m.id !== action.id);
      const remaining = makeCatalogue(customMeals).get;
      const plans = Object.fromEntries(
        Object.entries(state.plans).map(([week, plan]) => [
          week,
          { ...plan, slots: withPortions(cleanSlots(plan.slots, remaining), state.diners, remaining) },
        ]),
      );
      return {
        ...state,
        customMeals,
        plans,
        order: without(state.order, action.id),
        liked: without(state.liked, action.id),
        noped: without(state.noped, action.id),
        settings: { ...state.settings, habits: state.settings.habits.filter((h) => h.mealId !== action.id) },
      };
    }
    case "resetChoices":
      return { ...state, order: strings(action.order).filter((id) => lookup()(id)), liked: [], noped: [] };
  }
}
