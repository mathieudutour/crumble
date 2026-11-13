import { useRef, type PointerEvent, type Ref } from "react";
import type { Meal } from "../data/types";
import { mealHue } from "../lib/format";
import { MealTags, mealGradient } from "./MealTags";

/** Horizontal drag, in px, past which a release counts as a swipe. */
const SWIPE_THRESHOLD = 90;
/** Movement under this, in px, counts as a tap. */
const TAP_SLOP = 6;

/** Staples that say little about a dish, hidden from the card unless the list is short. */
const STAPLES = ["Mâche", "Lait", "Beurre", "Farine", "Crème fraîche", "Pâte brisée", "Œufs"];

const ingredientSummary = (meal: Meal) =>
  meal.ingredients
    .filter(([name]) => !STAPLES.includes(name) || meal.ingredients.length < 4)
    .slice(0, 5)
    .map(([name]) => name.toLowerCase())
    .join(" · ");

interface Props {
  meal: Meal;
  /** 0 for the top card, then 1 and 2 for the cards peeking underneath. */
  depth: number;
  ref?: Ref<HTMLDivElement>;
  onTap?: () => void;
  onSwipe?: (liked: boolean, dy: number) => void;
}

/** Flings a card off screen. Shared by drag releases and the like/nope buttons. */
export function flyOut(card: HTMLElement, liked: boolean, dy = 0) {
  const stamp = card.querySelector<HTMLElement>(liked ? ".stamp.like" : ".stamp.nope");
  if (stamp) stamp.style.opacity = "1";
  card.style.transition = "transform .35s ease-out, opacity .35s";
  card.style.transform = `translate(${(liked ? 1 : -1) * Math.max(500, innerWidth * 1.2)}px, ${dy * 0.35}px) rotate(${liked ? 24 : -24}deg)`;
  card.style.opacity = ".6";
}

export function SwipeCard({ meal, depth, ref, onTap, onSwipe }: Props) {
  const drag = useRef({ active: false, x: 0, y: 0, dx: 0, dy: 0 });
  const likeStamp = useRef<HTMLDivElement>(null);
  const nopeStamp = useRef<HTMLDivElement>(null);
  const isTop = depth === 0;

  const setStamps = (dx: number) => {
    if (likeStamp.current) likeStamp.current.style.opacity = String(Math.max(0, Math.min(1, dx / SWIPE_THRESHOLD)));
    if (nopeStamp.current) nopeStamp.current.style.opacity = String(Math.max(0, Math.min(1, -dx / SWIPE_THRESHOLD)));
  };

  const handlers = isTop
    ? {
        onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
          drag.current = { active: true, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
          e.currentTarget.style.transition = "none";
          e.currentTarget.setPointerCapture(e.pointerId);
        },
        onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
          const d = drag.current;
          if (!d.active) return;
          d.dx = e.clientX - d.x;
          d.dy = e.clientY - d.y;
          e.currentTarget.style.transform = `translate(${d.dx}px, ${d.dy * 0.35}px) rotate(${d.dx / 18}deg)`;
          setStamps(d.dx);
        },
        onPointerUp: (e: PointerEvent<HTMLDivElement>) => release(e.currentTarget),
        onPointerCancel: (e: PointerEvent<HTMLDivElement>) => release(e.currentTarget),
      }
    : {};

  function release(card: HTMLDivElement) {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    if (Math.abs(d.dx) < TAP_SLOP && Math.abs(d.dy) < TAP_SLOP) {
      card.style.transform = "";
      onTap?.();
    } else if (Math.abs(d.dx) > SWIPE_THRESHOLD) {
      onSwipe?.(d.dx > 0, d.dy);
    } else {
      card.style.transition = "transform .25s ease";
      card.style.transform = "";
      setStamps(0);
    }
  }

  return (
    <div
      ref={ref}
      className="card"
      style={{
        transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`,
        zIndex: 10 - depth,
        filter: depth ? "brightness(.97)" : undefined,
      }}
      aria-hidden={!isTop}
      {...handlers}
    >
      <div className="pic" style={{ background: mealGradient(mealHue(meal)) }}>
        <span aria-hidden="true">{meal.emoji}</span>
        <div ref={likeStamp} className="stamp like">
          MIAM
        </div>
        <div ref={nopeStamp} className="stamp nope">
          BOF
        </div>
      </div>
      <div className="body">
        <h3>{meal.name}</h3>
        <MealTags meal={meal} />
        <div className="ing">{ingredientSummary(meal)}</div>
      </div>
    </div>
  );
}
