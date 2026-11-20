import { useState } from "react";
import { DAYS, fitsSlot, slotIndex, slotName } from "../lib/planning";
import { dayTitle } from "../lib/shopping";
import { addDays, mondayOf, todayIso } from "../lib/week";
import { emptyPlan, emptySlots } from "../store/plan";
import { useStore } from "../store/StoreProvider";
import { Sheet, SheetHeader } from "./Sheet";
import { useUi } from "./UiProvider";

const capitalize = (text: string) => text[0]!.toUpperCase() + text.slice(1);

/**
 * Puts a recipe in this week's or next week's plan, so its ingredients go on the shopping list. A main dish takes the
 * meal's place; a starter or dessert goes alongside its main dish. A week without a plan gets an empty one.
 */
export function AddToPlanSheet({ mealId, onClose }: { mealId: string; onClose: () => void }) {
  const { state, catalogue, dispatch } = useStore();
  const { toast } = useUi();
  const thisMonday = mondayOf(new Date());
  const weeks = [thisMonday, addDays(thisMonday, 7)];
  const [week, setWeek] = useState(weeks.includes(state.week) ? state.week : thisMonday);
  const meal = catalogue.get(mealId);
  if (!meal) return null;
  const plan = state.plans[week];
  // Without a plan yet, show the one adding would create.
  const slots = plan?.slots ?? emptySlots(state, catalogue);
  const extras = plan?.extras ?? [];
  const today = todayIso();

  const add = (slot: number) => {
    if (!plan) dispatch(emptyPlan(state, catalogue, week));
    const when = capitalize(slotName(slot));
    if (meal.course) {
      dispatch({ type: "addExtra", week, slot, mealId });
      toast(`${when} : ${meal.name}`, () => dispatch({ type: "removeExtra", week, slot, mealId }));
    } else {
      const before = slots[slot];
      dispatch({ type: "placeMeal", week, slot, mealId });
      toast(`${when} : ${meal.name}`, () =>
        dispatch(
          before?.kind === "cook"
            ? { type: "placeMeal", week, slot, mealId: before.mealId }
            : { type: "clearSlot", week, slot },
        ),
      );
    }
    onClose();
  };

  return (
    <Sheet onClose={onClose} labelledBy="add-to-plan-title">
      <div className="in">
        <SheetHeader id="add-to-plan-title" title="Ajouter au planning" onClose={onClose} />
        <p className="note">
          {meal.course
            ? `${meal.name}, en plus du plat du repas choisi.`
            : `${meal.name} remplace ce qui est prévu au repas choisi.`}{" "}
          Ses ingrédients vont dans la liste de courses.
        </p>
        <div className="segmented spaced" role="radiogroup" aria-label="Semaine">
          {weeks.map((w, i) => (
            <button
              key={w}
              role="radio"
              aria-checked={week === w}
              className={week === w ? "on" : undefined}
              onClick={() => setWeek(w)}
            >
              {i ? "Semaine prochaine" : "Cette semaine"}
            </button>
          ))}
        </div>
        {DAYS.map((_, day) => {
          if (addDays(week, day) < today) return null;
          return (
            <section className="slot-choices" key={day}>
              <h5>{dayTitle(week, day)}</h5>
              {[false, true].map((dinner) => {
                const slot = slotIndex(day, dinner);
                const entry = slots[slot]!;
                const planned =
                  entry.kind === "cook" || entry.kind === "leftovers" ? catalogue.get(entry.mealId) : undefined;
                const already = meal.course
                  ? extras.some((e) => e.slot === slot && e.mealId === mealId)
                  : planned?.id === mealId && entry.kind === "cook";
                const why =
                  entry.kind === "none"
                    ? "Personne à la maison"
                    : already
                      ? "Déjà prévu"
                      : !meal.course && !fitsSlot(meal, slot)
                        ? dinner
                          ? "Plutôt pour un midi"
                          : "Plutôt pour un soir"
                        : undefined;
                const current = planned
                  ? `${entry.kind === "leftovers" ? "Restes · " : ""}${planned.name}`
                  : entry.kind === "none"
                    ? ""
                    : "Rien de prévu";
                return (
                  <button key={slot} className="slot-choice" disabled={!!why} onClick={() => add(slot)}>
                    <span className="when">{dinner ? "Soir" : "Midi"}</span>
                    <span className="what">
                      {current}
                      {why && (
                        <span className="note">
                          {" "}
                          {current ? "· " : ""}
                          {why}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
    </Sheet>
  );
}
