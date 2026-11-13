import { fitsDiet } from "../data/diet";
import { avoidedIn } from "../lib/avoid";
import type { Meal } from "../data/types";
import type { Catalogue } from "../lib/catalogue";
import { dayOf, type Preferences } from "../lib/planning";
import { isInSeason } from "../lib/season";
import { addDays, daysBetween, seasonMonthOf } from "../lib/week";
import type { AppState } from "./types";

const canDine = (m: Meal) => m.type !== "lunch";
const canLunch = (m: Meal) => m.type !== "dinner";

/** How far back a meal counts as eaten recently, in days. */
const RECENT_DAYS = 21;

/** Fits the household's diet and contains nothing they avoid. Applies to habits too. */
export const fitsHousehold = (s: AppState, meal: Meal) =>
  fitsDiet(meal, s.settings.diet) && !avoidedIn(meal, s.settings.avoid).length;

/** In season for the week being planned, and fits the household. */
export const isAvailable = (s: AppState, meal: Meal | undefined): meal is Meal =>
  !!meal && isInSeason(meal, seasonMonthOf(s.week)) && fitsHousehold(s, meal);

/** How many dinners and lunches to like before planning: 5 and 3, fewer if the choice is thin. */
export function required(s: AppState, catalogue: Catalogue) {
  const available = catalogue.swipeable.filter((m) => isAvailable(s, m));
  return {
    dinners: Math.min(5, available.filter(canDine).length),
    lunches: Math.min(3, available.filter(canLunch).length),
  };
}

/** Deck still to swipe, favourites first and dishes they didn't enjoy last. */
export function remainingIds(s: AppState, catalogue: Catalogue): string[] {
  const rank = (id: string) => (s.ratings[id] === 1 ? 0 : s.ratings[id] === -1 ? 2 : 1);
  // Dishes added since the deck was shuffled (an app update) go at the end.
  const inOrder = new Set(s.order);
  const ids = [...s.order, ...catalogue.swipeable.map((m) => m.id).filter((id) => !inOrder.has(id))];
  return ids
    .filter((id) => isAvailable(s, catalogue.get(id)) && !s.liked.includes(id) && !s.noped.includes(id))
    .sort((a, b) => rank(a) - rank(b));
}

/** Liked meals available this week. Others are kept and come back with their season. */
export const likedMeals = (s: AppState, catalogue: Catalogue): Meal[] =>
  s.liked.map(catalogue.get).filter((m): m is Meal => isAvailable(s, m));

export function counts(s: AppState, catalogue: Catalogue) {
  const liked = likedMeals(s, catalogue);
  return { dinners: liked.filter(canDine).length, lunches: liked.filter(canLunch).length };
}

export function isReady(s: AppState, catalogue: Catalogue) {
  const have = counts(s, catalogue);
  const need = required(s, catalogue);
  return have.dinners >= need.dinners && have.lunches >= need.lunches;
}

/** Changes whenever what a plan is drawn from changes, so an older plan shows as stale. */
export const planKey = (s: AppState, catalogue: Catalogue) =>
  JSON.stringify([
    likedMeals(s, catalogue)
      .map((m) => m.id)
      .sort(),
    // Diners are left out: changing them adjusts the plan directly.
    s.settings,
  ]);

/** Days since each meal was last cooked, for meals cooked in the weeks before `week`. */
export function recentMeals(s: AppState, week = s.week): Map<string, number> {
  const recent = new Map<string, number>();
  for (const [planWeek, plan] of Object.entries(s.plans)) {
    if (planWeek >= week) continue;
    plan.slots.forEach((slot, i) => {
      if (slot.kind !== "cook") return;
      const days = daysBetween(addDays(planWeek, dayOf(i)), week);
      if (days > RECENT_DAYS) return;
      recent.set(slot.mealId, Math.min(days, recent.get(slot.mealId) ?? Infinity));
    });
  }
  return recent;
}

export const preferencesOf = (s: AppState): Preferences => ({
  weeknightMinutes: s.settings.weeknightMinutes,
  recent: recentMeals(s),
  ratings: s.ratings,
  kidsLike: s.kidsLike,
});

/** "la semaine dernière", "il y a 2 semaines". */
export function eatenLabel(days: number): string {
  if (days <= 7) return "la semaine dernière";
  return `il y a ${Math.round(days / 7)} semaines`;
}
