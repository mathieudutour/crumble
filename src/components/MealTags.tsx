import type { Meal } from "../data/types";
import { typeLabel } from "../lib/format";
import { seasonLabel } from "../lib/season";
import { useStore } from "../store/StoreProvider";
import { eatenLabel, recentMeals } from "../store/selectors";

export function MealTags({ meal }: { meal: Meal }) {
  const { state } = useStore();
  const fixed = meal.type === "fixed";
  const eaten = recentMeals(state).get(meal.id);
  return (
    <div className="tags">
      {state.ratings[meal.id] === 1 && <span className="tag love">😋 Coup de cœur</span>}
      {state.kidsLike[meal.id] && <span className="tag love">🧒 Les enfants aiment</span>}
      {!fixed && <span className="tag">{typeLabel(meal)}</span>}
      <span className="tag">⏱ {meal.time}</span>
      {meal.batch && <span className="tag batch">🔁 fait 2 repas</span>}
      {!fixed && <span className="tag">🗓 {seasonLabel(meal)}</span>}
      {eaten !== undefined && <span className="tag recent">Mangé {eatenLabel(eaten)}</span>}
      {meal.custom && <span className="tag">✍️ Mon plat</span>}
    </div>
  );
}

/** Soft two-tone gradient behind a meal's emoji. */
export const mealGradient = (hue: number, end = 76) =>
  `linear-gradient(160deg, hsl(${hue} 75% 88%), hsl(${hue + 20} 65% ${end}%))`;
