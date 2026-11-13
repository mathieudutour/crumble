import { useState } from "react";
import type { Meal } from "../data/types";
import { fitsSlot, isTooLong, slotName } from "../lib/planning";
import { useStore } from "../store/StoreProvider";
import { eatenLabel, isAvailable, recentMeals } from "../store/selectors";
import { DishThumb } from "./DishArt";
import { Sheet, SheetHeader } from "./Sheet";

interface Props {
  slot: number;
  /** Meal currently in the slot, left out of the choices. */
  currentId?: string;
  onPick: (meal: Meal) => void;
  /** Offered when the slot has something to remove. */
  onClear?: () => void;
  onClose: () => void;
}

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Choose what to cook in a plan slot: liked meals first, then anything else available this week. */
export function MealPicker({ slot, currentId, onPick, onClear, onClose }: Props) {
  const { state, catalogue } = useStore();
  const [query, setQuery] = useState("");
  const recent = recentMeals(state);

  const matches = (meal: Meal) =>
    meal.id !== currentId && fitsSlot(meal, slot) && normalize(meal.name).includes(normalize(query));
  const byName = (a: Meal, b: Meal) => a.name.localeCompare(b.name, "fr");
  const available = catalogue.all.filter((m) => m.type !== "fixed" && isAvailable(state, m) && matches(m));
  const liked = available.filter((m) => state.liked.includes(m.id)).sort(byName);
  const others = available.filter((m) => !state.liked.includes(m.id)).sort(byName);
  const habits = catalogue.all.filter((m) => m.type === "fixed" && matches(m));

  const row = (meal: Meal) => {
    const eaten = recent.get(meal.id);
    const notes = [
      meal.time,
      meal.batch ? "fait 2 repas" : "",
      isTooLong(meal, slot, state.settings.weeknightMinutes) ? "⚠ long pour un soir de semaine" : "",
      eaten !== undefined ? `mangé ${eatenLabel(eaten)}` : "",
    ].filter(Boolean);
    return (
      <button key={meal.id} className="pick choice" onClick={() => onPick(meal)}>
        <DishThumb meal={meal} />
        <span className="nm">
          {meal.name}
          <br />
          <span className="note">{notes.join(" · ")}</span>
        </span>
        {state.ratings[meal.id] === 1 && <span aria-label="Coup de cœur">😋</span>}
      </button>
    );
  };

  return (
    <Sheet onClose={onClose} labelledBy="picker-title">
      <div className="in">
        <SheetHeader id="picker-title" title={`Que manger ${slotName(slot)} ?`} onClose={onClose} />
        <input
          className="field"
          type="search"
          placeholder="Chercher un plat"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Chercher un plat"
        />
        {onClear && (
          <button className="cta ghost slim" onClick={onClear}>
            Ne rien prévoir
          </button>
        )}
        {liked.length > 0 && <h5>Tes plats gardés</h5>}
        {liked.map(row)}
        {others.length > 0 && <h5>Autres plats de saison</h5>}
        {others.map(row)}
        {habits.length > 0 && <h5>Plats des habitudes</h5>}
        {habits.map(row)}
        {!liked.length && !others.length && !habits.length && <p className="note spaced">Aucun plat ne correspond.</p>}
      </div>
    </Sheet>
  );
}
