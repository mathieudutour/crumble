import { useId, useState, type FormEvent } from "react";
import { ALL_YEAR } from "../data/meals";
import type { Ingredient, Meal, MealType } from "../data/types";
import { recipeSteps } from "../lib/catalogue";
import { COUNT_UNITS } from "../lib/format";
import { parseMealTime, mealTimeLabel } from "../lib/time";
import { MONTHS_SHORT } from "../lib/week";
import { useStore } from "../store/StoreProvider";
import { Sheet, SheetHeader } from "./Sheet";
import { useUi } from "./UiProvider";

const EMOJIS = ["🍲", "🥘", "🍝", "🍛", "🥗", "🍳", "🐟", "🍗", "🥩", "🥧", "🌮", "🍕", "🥙", "🍜", "🥦", "🧀"];
const UNITS = ["", "g", "cl", ...COUNT_UNITS];
const TYPES: { value: Exclude<MealType, "fixed">; label: string }[] = [
  { value: "dinner", label: "Dîner" },
  { value: "lunch", label: "Midi" },
  { value: "either", label: "Midi ou soir" },
];

interface Row {
  key: number;
  name: string;
  quantity: string;
  unit: string;
}

let nextRowKey = 1;
const toRow = ([name, quantity, unit]: Ingredient): Row => ({
  key: nextRowKey++,
  name,
  quantity: String(quantity).replace(".", ","),
  unit,
});
const emptyRow = (): Row => ({ key: nextRowKey++, name: "", quantity: "", unit: "" });

/** Create or edit one of the household's own dishes. */
export function MealForm({ meal, onClose }: { meal?: Meal; onClose: () => void }) {
  const { dispatch, catalogue } = useStore();
  const { toast } = useUi();
  const listId = useId();
  const knownIngredients = [...new Set(catalogue.all.flatMap((m) => m.ingredients.map(([n]) => n)))].sort((a, b) => a.localeCompare(b, "fr"));
  const time = meal ? parseMealTime(meal.time) : undefined;

  const [name, setName] = useState(meal?.name ?? "");
  const [emoji, setEmoji] = useState(meal?.emoji ?? "🍲");
  const [type, setType] = useState<Exclude<MealType, "fixed">>(meal && meal.type !== "fixed" ? meal.type : "dinner");
  const [total, setTotal] = useState(String(time?.total ?? 30));
  const [active, setActive] = useState(time && time.active < time.total ? String(time.active) : "");
  const [batch, setBatch] = useState(!!meal?.batch);
  const [months, setMonths] = useState<number[]>([...(meal?.months ?? ALL_YEAR)]);
  const [rows, setRows] = useState<Row[]>(
    meal?.ingredients.length ? meal.ingredients.map(toRow) : [emptyRow(), emptyRow()],
  );
  const [steps, setSteps] = useState(meal ? recipeSteps(meal).join("\n") : "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const toggleMonth = (month: number) =>
    setMonths((all) => (all.includes(month) ? all.filter((m) => m !== month) : [...all, month].sort((a, b) => a - b)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const totalMinutes = Math.max(1, Math.round(Number(total) || 0));
    const activeMinutes = Math.round(Number(active) || 0);
    const ingredients: Ingredient[] = rows
      .filter((r) => r.name.trim())
      .map((r) => [r.name.trim(), Math.max(0, Number(r.quantity.replace(",", ".")) || 1), r.unit]);
    dispatch({
      type: "saveMeal",
      meal: {
        id: meal?.id ?? `perso-${Date.now().toString(36)}`,
        emoji: emoji.trim() || "🍽",
        name: name.trim(),
        type,
        time: mealTimeLabel(totalMinutes, activeMinutes || undefined),
        batch: batch || undefined,
        ingredients,
        months: months.length ? months : ALL_YEAR,
        steps: steps
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        custom: true,
      },
    });
    toast(meal ? "Plat modifié" : "Plat ajouté à tes plats gardés");
    onClose();
  };

  return (
    <Sheet onClose={onClose} labelledBy="meal-form-title">
      <form className="in form" onSubmit={submit}>
        <SheetHeader id="meal-form-title" title={meal ? "Modifier mon plat" : "Ajouter un plat"} onClose={onClose} />

        <label className="label" htmlFor="meal-name">
          Nom
        </label>
        <input
          id="meal-name"
          className="field"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Gratin de courgettes de mamie"
        />

        <span className="label">Icône</span>
        <div className="emoji-row" role="radiogroup" aria-label="Icône">
          {EMOJIS.map((e) => (
            <button
              type="button"
              key={e}
              role="radio"
              aria-checked={emoji === e}
              className={`emoji${emoji === e ? " on" : ""}`}
              onClick={() => setEmoji(e)}
            >
              {e}
            </button>
          ))}
          <input
            className="field emoji-input"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            aria-label="Autre icône"
            maxLength={4}
          />
        </div>

        <span className="label">C’est pour</span>
        <div className="segmented" role="radiogroup" aria-label="C’est pour">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t.value}
              role="radio"
              aria-checked={type === t.value}
              className={type === t.value ? "on" : undefined}
              onClick={() => setType(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="row form-row">
          <label>
            <span className="label">Temps total (min)</span>
            <input
              className="field"
              type="number"
              min={1}
              inputMode="numeric"
              required
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </label>
          <label>
            <span className="label">Dont actif (min)</span>
            <input
              className="field"
              type="number"
              min={0}
              inputMode="numeric"
              value={active}
              onChange={(e) => setActive(e.target.value)}
              placeholder="tout"
            />
          </label>
        </div>

        <label className="check">
          <input type="checkbox" checked={batch} onChange={(e) => setBatch(e.target.checked)} />
          Fait 2 repas : le planning prévoit les restes
        </label>

        <span className="label">Saison</span>
        <div className="months">
          {MONTHS_SHORT.map((label, i) => (
            <button
              type="button"
              key={label}
              aria-pressed={months.includes(i + 1)}
              className={`pill${months.includes(i + 1) ? " on" : ""}`}
              onClick={() => toggleMonth(i + 1)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={months.length === 12}
            className={`pill${months.length === 12 ? " on" : ""}`}
            onClick={() => setMonths([...ALL_YEAR])}
          >
            Toute l’année
          </button>
        </div>

        <span className="label">Ingrédients</span>
        <p className="note">
          Pour {batch ? "5" : "2,5"} portions{batch ? ", restes compris" : ""} : le planning adapte ensuite les
          quantités. Choisis un nom de la liste pour qu’il soit rangé dans le bon rayon.
        </p>
        <datalist id={listId}>
          {knownIngredients.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {rows.map((r) => (
          <div className="ingredient-row" key={r.key}>
            <input
              className="field"
              list={listId}
              value={r.name}
              onChange={(e) => setRow(r.key, { name: e.target.value })}
              placeholder="Ingrédient"
              aria-label="Ingrédient"
            />
            <input
              className="field qty"
              inputMode="decimal"
              value={r.quantity}
              onChange={(e) => setRow(r.key, { quantity: e.target.value })}
              placeholder="Qté"
              aria-label="Quantité"
            />
            <select
              className="field unit"
              value={r.unit}
              onChange={(e) => setRow(r.key, { unit: e.target.value })}
              aria-label="Unité"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u || "pièce"}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="remove"
              onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))}
              aria-label="Retirer"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="cta ghost slim" onClick={() => setRows((all) => [...all, emptyRow()])}>
          + Ingrédient
        </button>

        <label className="label" htmlFor="meal-steps">
          Recette, une étape par ligne
        </label>
        <textarea
          id="meal-steps"
          className="field"
          rows={6}
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          placeholder={"Préchauffe le four à 200 °C.\nCuis 25 min."}
        />
        <p className="note">
          Les durées (« 25 min ») deviennent des minuteurs dans le mode cuisine. Mets une quantité entre accolades, comme {"{3 œufs}"} ou {"{200 g}"}, pour qu’elle suive le nombre de portions.
        </p>

        <button type="submit" className="cta">
          {meal ? "Enregistrer" : "Ajouter le plat"}
        </button>
        {meal && (
          <button
            type="button"
            className={`cta ghost${confirmDelete ? " danger" : ""}`}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              dispatch({ type: "deleteMeal", id: meal.id });
              toast("Plat supprimé");
              onClose();
            }}
          >
            {confirmDelete ? "Sûr ? Touche encore pour supprimer" : "Supprimer ce plat"}
          </button>
        )}
      </form>
    </Sheet>
  );
}
