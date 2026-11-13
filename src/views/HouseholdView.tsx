import { DishThumb } from "../components/DishArt";
import { useMemo, useState } from "react";
import { Agents } from "../components/Agents";
import { Sharing } from "../components/Sharing";
import { useUi } from "../components/UiProvider";
import type { Diet } from "../data/diet";
import { DAYS, DEFAULT_HABITS, SLOT_COUNT, slotIndex, slotName } from "../lib/planning";
import { avoidedIn, avoidOptions, matchesSearch, normalize } from "../lib/avoid";
import { plural } from "../lib/format";
import { formatMinutes } from "../lib/time";
import { useStore } from "../store/StoreProvider";
import { fitsHousehold, isReady } from "../store/selectors";
import type { DinersField } from "../shared/household";

function Stepper({ slot, field, icon, label }: { slot: number; field: DinersField; icon: string; label: string }) {
  const { state, dispatch } = useStore();
  const value = state.diners[slot]![field];
  const adjust = (delta: number) => dispatch({ type: "setDiners", slot, field, value: value + delta });
  return (
    <div className="step" role="group" aria-label={label}>
      <button onClick={() => adjust(-1)} aria-label={`Moins d’${label.toLowerCase()}`}>
        −
      </button>
      <span>
        {icon} {value}
      </span>
      <button onClick={() => adjust(1)} aria-label={`Plus d’${label.toLowerCase()}`}>
        +
      </button>
    </div>
  );
}

function DinersRow({ slot }: { slot: number }) {
  const { state } = useStore();
  const diners = state.diners[slot]!;
  return (
    <div className="wrow">
      <div className="when">{slot % 2 ? "Soir" : "Midi"}</div>
      <Stepper slot={slot} field="adults" icon="👤" label="Adultes" />
      <Stepper slot={slot} field="kids" icon="🧒" label="Enfants" />
      {!diners.adults && !diners.kids && <span className="off">dehors</span>}
    </div>
  );
}

/** The week at a glance: who eats at home, meal by meal. */
function DinersWeek() {
  const { state } = useStore();
  const cell = (slot: number) => {
    const { adults, kids } = state.diners[slot]!;
    if (!adults && !kids)
      return (
        <td key={slot} className="away">
          dehors
        </td>
      );
    return (
      <td key={slot}>
        {adults}
        {kids > 0 && <span className="kids"> +{kids}</span>}
      </td>
    );
  };
  return (
    <table className="diners-week">
      <caption className="note">Adultes, + enfants</caption>
      <thead>
        <tr>
          <th scope="col" aria-label="Repas" />
          {DAYS.map((day) => (
            <th scope="col" key={day} abbr={day}>
              {day.slice(0, 3)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[false, true].map((dinner) => (
          <tr key={String(dinner)}>
            <th scope="row">{dinner ? "Soir" : "Midi"}</th>
            {DAYS.map((_, d) => cell(slotIndex(d, dinner)))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Habits() {
  const { state, catalogue, dispatch } = useStore();
  const habits = state.settings.habits;
  const freeSlots = Array.from({ length: SLOT_COUNT }, (_, s) => s).filter((s) => !habits.some((h) => h.slot === s));
  const [slot, setSlot] = useState(freeSlots[0] ?? 0);
  const [mealId, setMealId] = useState("pesto");
  const [adding, setAdding] = useState(false);
  const setHabits = (next: typeof habits) =>
    dispatch({ type: "setSettings", settings: { habits: [...next].sort((a, b) => a.slot - b.slot) } });
  const choices = [...catalogue.all].sort(
    (a, b) => Number(b.type === "fixed") - Number(a.type === "fixed") || a.name.localeCompare(b.name, "fr"),
  );

  return (
    <>
      {habits.map((h) => {
        const meal = catalogue.get(h.mealId);
        return (
          <div className="pick" key={h.slot}>
            {meal && <DishThumb meal={meal} />}
            <span className="nm">
              {meal?.name}
              <br />
              <span className="note">Chaque {slotName(h.slot)}</span>
              {meal && !fitsHousehold(state, meal) && (
                <>
                  <br />
                  <span className="note alert">
                    Pas prévu :{" "}
                    {avoidedIn(meal, state.settings.avoid).length
                      ? `contient ${avoidedIn(meal, state.settings.avoid).join(", ").toLowerCase()}`
                      : "ne correspond pas à ton régime"}
                  </span>
                </>
              )}
            </span>
            <button
              className="toggle"
              onClick={() => setHabits(habits.filter((x) => x !== h))}
              aria-label={`Retirer ${meal?.name}`}
            >
              ✕
            </button>
          </div>
        );
      })}
      {!habits.length && <p className="note">Aucune habitude : tout le planning est tiré au sort.</p>}
      {freeSlots.length > 0 && !adding && (
        <button className="cta ghost" onClick={() => setAdding(true)}>
          + Ajouter une habitude
        </button>
      )}
      {freeSlots.length > 0 && adding && (
        <div className="habit-form">
          <select className="field" value={slot} onChange={(e) => setSlot(Number(e.target.value))} aria-label="Quand">
            {freeSlots.map((s) => (
              <option key={s} value={s}>
                Chaque {slotName(s)}
              </option>
            ))}
          </select>
          <select className="field" value={mealId} onChange={(e) => setMealId(e.target.value)} aria-label="Quel plat">
            {choices.map((m) => (
              <option key={m.id} value={m.id}>
                {m.emoji} {m.name}
              </option>
            ))}
          </select>
          <button
            className="cta ghost slim"
            onClick={() => {
              if (!freeSlots.includes(slot)) return;
              setHabits([...habits, { slot, mealId }]);
              setAdding(false);
              setSlot(freeSlots.find((s) => s !== slot) ?? 0);
            }}
          >
            + Ajouter l’habitude
          </button>
        </div>
      )}
      <button className="link-button" onClick={() => setHabits([...DEFAULT_HABITS])}>
        Revenir aux habitudes de départ
      </button>
    </>
  );
}

function AvoidIngredients() {
  const { state, catalogue, dispatch } = useStore();
  const [query, setQuery] = useState("");
  const avoid = state.settings.avoid;
  const options = useMemo(() => avoidOptions(catalogue.all), [catalogue]);
  const setAvoid = (next: string[]) => dispatch({ type: "setSettings", settings: { avoid: next } });
  const search = normalize(query);
  const matches = search ? options.filter((o) => !avoid.includes(o.name) && matchesSearch(o.name, query)).slice(0, 8) : [];
  const excluded = catalogue.swipeable.filter((m) => avoidedIn(m, avoid).length).length;

  return (
    <>
      {avoid.length > 0 && (
        <>
          <div className="feedback">
            {avoid.map((name) => (
              <button key={name} className="pill on" onClick={() => setAvoid(avoid.filter((x) => x !== name))} aria-label={`Ne plus éviter : ${name}`}>
                {name} ✕
              </button>
            ))}
          </div>
          <p className="note spaced">{excluded ? `${plural(excluded, "plat")} mis de côté.` : "Aucun plat n’en contient."}</p>
        </>
      )}
      <input
        className="field spaced"
        type="search"
        placeholder="Chercher : œufs, noix, moutarde…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Chercher un ingrédient à éviter"
      />
      {matches.map((option) => (
        <button
          key={option.name}
          className="pick choice"
          onClick={() => {
            setAvoid([...avoid, option.name]);
            setQuery("");
          }}
        >
          <span className="nm">
            {option.name}
            <br />
            <span className="note">{option.count ? `dans ${plural(option.count, "plat")}` : "dans aucun plat pour l’instant"}</span>
          </span>
          <span className="accent">Éviter</span>
        </button>
      ))}
      {search && !matches.length && <p className="note spaced">Aucun ingrédient ne correspond.</p>}
      <p className="note spaced">
        Les plats qui en contiennent disparaissent des cartes, du planning et des habitudes. Pour une allergie, vérifie aussi les produits tout prêts (pâte brisée,
        bouillon, pesto, pain, charcuterie…) : leur composition dépend de la marque et l’app ne la connaît pas.
      </p>
    </>
  );
}

const DIETS: { key: keyof Diet; label: string }[] = [
  { key: "vegetarian", label: "🥕 Végétarien" },
  { key: "noPork", label: "🐷 Sans porc" },
  { key: "noFish", label: "🐟 Sans poisson ni fruits de mer" },
];

const LIMITS = [30, 45, 60, null];

export function HouseholdView({ onPlan, onSwipe }: { onPlan: () => void; onSwipe: () => void }) {
  const { state, status, catalogue, dispatch, buildPlan } = useStore();
  const { toast } = useUi();
  const { diet, weeknightMinutes } = state.settings;
  const [editingDiners, setEditingDiners] = useState(false);
  const plan = state.plans[state.week];

  return (
    <>
      <h2>Foyer partagé</h2>
      <Sharing />

      <h2 className="section-title">Agents IA</h2>
      {status.mode === "household" ? (
        <Agents householdKey={status.key} />
      ) : (
        <p className="note">Partage d’abord ton foyer, même si tu es seul : un agent IA comme Hermes pourra alors utiliser Crumble pour toi.</p>
      )}

      <h2 className="section-title">Qui mange quand ?</h2>
      <DinersWeek />
      {editingDiners ? (
        <>
          <p className="note spaced-bottom">
            Mets 0 pour un repas à l’extérieur : il ne sera pas prévu. Le planning en cours s’adapte tout de suite.
          </p>
          {DAYS.map((day, d) => (
            <section className="day" key={day}>
              <h4>{day}</h4>
              <DinersRow slot={slotIndex(d, false)} />
              <DinersRow slot={slotIndex(d, true)} />
            </section>
          ))}
          <div className="row">
            <button
              className="cta ghost"
              onClick={() => {
                dispatch({ type: "resetDiners" });
                toast("Convives par défaut");
              }}
            >
              Par défaut
            </button>
            <button className="cta" onClick={() => setEditingDiners(false)}>
              Terminé
            </button>
          </div>
        </>
      ) : (
        <button className="cta ghost" onClick={() => setEditingDiners(true)}>
          Modifier
        </button>
      )}

      <h2 className="section-title">Habitudes</h2>
      <p className="note spaced-bottom">
        Des plats prévus chaque semaine au même moment, en plus de ce que tu choisis.
      </p>
      <Habits />

      <h2 className="section-title">Régime</h2>
      <p className="note spaced-bottom">Les plats qui ne conviennent pas disparaissent des cartes et du planning.</p>
      <div className="feedback">
        {DIETS.map(({ key, label }) => (
          <button
            key={key}
            className={`pill${diet[key] ? " on" : ""}`}
            aria-pressed={diet[key]}
            onClick={() => dispatch({ type: "setSettings", settings: { diet: { ...diet, [key]: !diet[key] } } })}
          >
            {label}
          </button>
        ))}
      </div>

      <h2 className="section-title">Ingrédients à éviter</h2>
      <p className="note spaced-bottom">Un ingrédient que tu n’aimes pas, ou une allergie.</p>
      <AvoidIngredients />

      <h2 className="section-title">Soirs de semaine</h2>
      <p className="note spaced-bottom">
        Temps maximum pour le dîner du lundi au vendredi. Les plats plus longs vont au week-end.
      </p>
      <div className="segmented" role="radiogroup" aria-label="Temps maximum en semaine">
        {LIMITS.map((limit) => (
          <button
            key={String(limit)}
            role="radio"
            aria-checked={weeknightMinutes === limit}
            className={weeknightMinutes === limit ? "on" : undefined}
            onClick={() => dispatch({ type: "setSettings", settings: { weeknightMinutes: limit } })}
          >
            {limit === null ? "Sans limite" : formatMinutes(limit)}
          </button>
        ))}
      </div>

      {plan && (
        <button
          className="cta"
          onClick={() => {
            if (!isReady(state, catalogue)) return onSwipe();
            buildPlan();
            onPlan();
          }}
        >
          Refaire le planning
        </button>
      )}
    </>
  );
}
