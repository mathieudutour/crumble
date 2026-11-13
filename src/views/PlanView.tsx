import { useState } from "react";
import { DishThumb } from "../components/DishArt";
import { EmptyState } from "../components/EmptyState";
import { MealPicker } from "../components/MealPicker";
import { Sheet, SheetHeader } from "../components/Sheet";
import { useUi } from "../components/UiProvider";
import { dinersText } from "../lib/format";
import { avoidedIn } from "../lib/avoid";
import { canMove } from "../lib/planEdit";
import { DAYS, hasLeftovers, isTooLong, slotIndex, slotName, type Plan, type PlanSlot } from "../lib/planning";
import { dayTitle, planText } from "../lib/shopping";
import { addDays, mondayOf, todayIso, weekName, weekRange } from "../lib/week";
import { useStore } from "../store/StoreProvider";
import { isReady, planKey, required } from "../store/selectors";

interface SlotRowProps {
  plan: Plan;
  slot: number;
  week: string;
  editable: boolean;
  moving: number | null;
  onMoveStart: (slot: number) => void;
  onMoveHere: (slot: number) => void;
}

/** What can be done with a planned meal, in one sheet rather than links on every row. */
function SlotActions({
  slot,
  entry,
  mealName,
  onRecipe,
  onChange,
  onMove,
  onLock,
  onClear,
  onClose,
}: {
  slot: number;
  entry: PlanSlot;
  mealName: string;
  onRecipe: () => void;
  onChange: () => void;
  onMove: () => void;
  onLock: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const cooking = entry.kind === "cook";
  return (
    <Sheet onClose={onClose} labelledBy="slot-actions-title">
      <div className="in">
        <SheetHeader id="slot-actions-title" title={mealName} onClose={onClose} />
        <p className="note">{slotName(slot)[0]!.toUpperCase() + slotName(slot).slice(1)}</p>
        <div className="action-list">
          <button onClick={onRecipe}>📖 Voir la recette</button>
          <button onClick={onChange}>🔄 Changer de plat</button>
          {cooking && <button onClick={onMove}>↕️ Déplacer à un autre moment</button>}
          {cooking && (
            <button onClick={onLock}>
              {entry.locked ? "🔓 Déverrouiller" : "🔒 Verrouiller"}
              <span className="note">{entry.locked ? "Un nouveau tirage pourra le changer" : "Un nouveau tirage le gardera"}</span>
            </button>
          )}
          <button className="danger" onClick={onClear}>
            Ne rien prévoir
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function SlotRow({ plan, slot, week, editable, moving, onMoveStart, onMoveHere }: SlotRowProps) {
  const { state, catalogue, dispatch } = useStore();
  const { openRecipe, openSheet } = useUi();
  const entry = plan[slot]!;
  const when = slot % 2 ? "Soir" : "Midi";
  const meal = entry.kind === "cook" || entry.kind === "leftovers" ? catalogue.get(entry.mealId) : undefined;
  const isPast = addDays(week, Math.floor(slot / 2)) < todayIso();
  const canEdit = editable && !isPast;

  const pick = () =>
    openSheet((close) => (
      <MealPicker
        slot={slot}
        currentId={entry.kind === "cook" ? entry.mealId : undefined}
        onPick={(m) => {
          dispatch({ type: "placeMeal", week, slot, mealId: m.id });
          close();
        }}
        onClose={close}
      />
    ));

  const showActions = () =>
    meal &&
    openSheet((close) => (
      <SlotActions
        slot={slot}
        entry={entry}
        mealName={meal.name}
        onRecipe={() => openRecipe(meal.id, entry.kind === "cook" ? entry : undefined)}
        onChange={pick}
        onMove={() => {
          close();
          onMoveStart(slot);
        }}
        onLock={() => {
          dispatch({ type: "setLock", week, slot, locked: entry.kind === "cook" && !entry.locked });
          close();
        }}
        onClear={() => {
          dispatch({ type: "clearSlot", week, slot });
          close();
        }}
        onClose={close}
      />
    ));

  const title = meal ? (
    entry.kind === "leftovers" ? (
      <>
        <span className="left">Restes</span> · {meal.name}
      </>
    ) : (
      <>
        <span className={entry.kind === "cook" && entry.habit ? "fixed" : undefined}>{meal.name}</span>
        {entry.kind === "cook" && entry.locked && <span aria-label=", verrouillé"> 🔒</span>}
      </>
    )
  ) : null;

  // While moving a meal, every row is either the meal being moved, a place it can go, or neither.
  if (moving !== null) {
    const target = canMove(plan, moving, slot, catalogue.get);
    return (
      <div className={`meal${moving === slot ? " moving" : target ? "" : " dimmed"}`}>
        <div className="when">{when}</div>
        <div className="meal-row static">
          {meal ? <DishThumb meal={meal} /> : <span className="thumb empty" aria-hidden="true" />}
          <span className="meal-main">
            <span className="what">{title ?? <span className="note">{entry.kind === "none" ? "Personne à la maison" : "Libre"}</span>}</span>
            {target && (
              <button className="cta slim inline" onClick={() => onMoveHere(slot)}>
                {entry.kind === "cook" ? "Échanger avec ce plat" : "Mettre ici"}
              </button>
            )}
          </span>
        </div>
      </div>
    );
  }

  if (entry.kind === "none" || (!meal && !canEdit)) {
    return (
      <div className="meal">
        <div className="when">{when}</div>
        <div className="meal-row static">
          <span className="thumb empty" aria-hidden="true" />
          <span className="what note">{entry.kind === "none" ? "Personne à la maison" : "Libre"}</span>
        </div>
      </div>
    );
  }

  const sub = [dinersText(state.diners[slot]!)];
  if (entry.kind === "cook" && meal) {
    sub.push(`⏱ ${meal.time}`);
    if (hasLeftovers(plan, slot)) sub.push("cuisiner aussi pour les restes");
  }
  const tooLong = entry.kind === "cook" && meal && isTooLong(meal, slot, state.settings.weeknightMinutes);
  const avoided = meal ? avoidedIn(meal, state.settings.avoid) : [];
  const askRating = entry.kind === "cook" && meal && isPast && state.ratings[meal.id] === undefined;
  const onTap = !meal ? pick : canEdit ? showActions : () => openRecipe(meal.id, entry.kind === "cook" ? entry : undefined);

  return (
    <div className="meal">
      <div className="when">{when}</div>
      <div className="meal-body">
        <button className="meal-row" onClick={onTap} aria-haspopup="dialog">
          {meal ? <DishThumb meal={meal} /> : <span className="thumb empty" aria-hidden="true">+</span>}
          <span className="meal-main">
            <span className="what">{title ?? <span className="accent">Choisir un plat</span>}</span>
            {meal && <span className="sub">{sub.join(" · ")}</span>}
            {tooLong && <span className="sub alert">⚠ Long pour un soir de semaine</span>}
            {avoided.length > 0 && <span className="sub alert">⚠ Contient {avoided.join(", ").toLowerCase()}, que tu évites</span>}
          </span>
          <span className="chevron" aria-hidden="true">
            ›
          </span>
        </button>
        {askRating && (
          <div className="slot-actions">
            <span className="note">C’était bon ?</span>
            <button className="pill" onClick={() => dispatch({ type: "rate", id: meal.id, rating: 1 })}>
              😋 On adore
            </button>
            <button className="pill" onClick={() => dispatch({ type: "rate", id: meal.id, rating: -1 })}>
              😕 Bof
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WeekNav({
  week,
  min,
  max,
  onChange,
}: {
  week: string;
  min: string;
  max: string;
  onChange: (week: string) => void;
}) {
  return (
    <div className="week-nav">
      <button
        className="round small"
        disabled={week <= min}
        onClick={() => onChange(addDays(week, -7))}
        aria-label="Semaine précédente"
      >
        ‹
      </button>
      <div className="week-label">
        <b>{weekName(week)}</b>
        <span className="note">{weekRange(week)}</span>
      </div>
      <button
        className="round small"
        disabled={week >= max}
        onClick={() => onChange(addDays(week, 7))}
        aria-label="Semaine suivante"
      >
        ›
      </button>
    </div>
  );
}

export function PlanView({ onSwipe, onShop }: { onSwipe: () => void; onShop: () => void }) {
  const { state, catalogue, dispatch, buildPlan } = useStore();
  const { toast, copy } = useUi();
  const thisMonday = mondayOf(new Date());
  const [pastWeek, setPastWeek] = useState<string | null>(null);
  const [moving, setMoving] = useState<number | null>(null);

  // This week and next are planned (and drive the deck); earlier weeks are history, shown read-only.
  const week = pastWeek ?? state.week;
  const editable = !pastWeek;
  const oldest = Object.keys(state.plans).sort()[0];
  const min = oldest && oldest < thisMonday ? oldest : thisMonday;
  const navigate = (next: string) => {
    setMoving(null);
    if (next >= thisMonday) {
      setPastWeek(null);
      dispatch({ type: "setWeek", week: next });
    } else {
      setPastWeek(next);
    }
  };

  const plan = state.plans[week];
  const nav = <WeekNav week={week} min={min} max={addDays(thisMonday, 7)} onChange={navigate} />;

  if (!plan) {
    const need = required(state, catalogue);
    return (
      <>
        {nav}
        {editable ? (
          <EmptyState scene="empty-plan" icon="🗓" title="Pas encore de planning" inline>
            <p className="note">
              Choisis au moins {need.dinners} dîners et {need.lunches} midis de saison, puis crée ton planning.
            </p>
            {isReady(state, catalogue) ? (
              <button className="cta inline" onClick={buildPlan}>
                Créer mon planning ✨
              </button>
            ) : (
              <button className="cta ghost inline" onClick={onSwipe}>
                Choisir des plats
              </button>
            )}
          </EmptyState>
        ) : (
          <EmptyState scene="empty-plan" icon="🗓" title="Pas de planning cette semaine-là" inline />
        )}
      </>
    );
  }

  const slots = plan.slots;
  const cooks = slots.filter((s) => s.kind === "cook").length;
  const leftovers = slots.filter((s) => s.kind === "leftovers").length;
  const today = todayIso();
  const movingMeal =
    moving !== null && slots[moving]?.kind === "cook"
      ? catalogue.get((slots[moving] as { mealId: string }).mealId)
      : undefined;

  return (
    <>
      {nav}
      {editable && plan.key !== planKey(state, catalogue) && (
        <div className="warn">
          Tes plats, les convives ou les réglages ont changé depuis ce tirage. Refais un tirage pour en tenir compte :
          les plats verrouillés 🔒 restent.
        </div>
      )}
      <p className="note plan-summary">
        {cooks} repas à cuisiner · {leftovers} de restes
      </p>
      <div className="row spaced-bottom">
        {editable && (
          <button
            className="cta ghost"
            onClick={() => {
              buildPlan();
              toast("Nouveau tirage");
            }}
          >
            🔀 Autre tirage
          </button>
        )}
        <button className="cta ghost" onClick={() => copy(planText(slots, catalogue.get, week))}>
          Copier
        </button>
      </div>
      {movingMeal && (
        <div className="move-banner" role="status">
          <span>
            Où mettre <b>{movingMeal.name}</b> ?
          </span>
          <button className="pill" onClick={() => setMoving(null)}>
            Annuler
          </button>
        </div>
      )}
      {DAYS.map((_, d) => {
        const date = addDays(week, d);
        return (
          <section className={`day${date === today ? " today" : ""}${date < today ? " past" : ""}`} key={d}>
            <h4>
              {dayTitle(week, d)}
              {date === today && <span className="today-badge">Aujourd’hui</span>}
            </h4>
            {[false, true].map((dinner) => {
              const slot = slotIndex(d, dinner);
              return (
                <SlotRow
                  key={slot}
                  plan={slots}
                  slot={slot}
                  week={week}
                  editable={editable}
                  moving={moving}
                  onMoveStart={setMoving}
                  onMoveHere={(to) => {
                    dispatch({ type: "moveMeal", week, from: moving!, to });
                    setMoving(null);
                  }}
                />
              );
            })}
          </section>
        );
      })}
      <p className="note spaced">
        Les plats que tu choisis ou déplaces sont verrouillés 🔒 : un nouveau tirage les garde. Une quiche fait 6 parts,
        les quantités suivent les convives (onglet « Foyer ») et les restes se gardent 3 jours au frigo.
      </p>
      {editable && (
        <button className="cta" onClick={onShop}>
          Voir la liste de courses →
        </button>
      )}
    </>
  );
}
