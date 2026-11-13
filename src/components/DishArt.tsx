import { dishImage, dishThumb } from "../data/images";
import type { Meal } from "../data/types";

/** The dish's illustration when there is one, its emoji otherwise. Decorative: the name is always next to it. */
export function DishArt({ meal }: { meal: Meal }) {
  const src = meal.custom ? undefined : dishImage(meal.id);
  if (!src) return <span aria-hidden="true">{meal.emoji}</span>;
  return <img className="dish-art" src={src} alt="" draggable={false} decoding="async" />;
}

/** A small round picture of the dish for lists, or its emoji. */
export function DishThumb({ meal }: { meal: Meal }) {
  const src = meal.custom ? undefined : dishThumb(meal.id);
  return (
    <span className="thumb" aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" decoding="async" draggable={false} /> : meal.emoji}
    </span>
  );
}
