import { avoidedIn } from "../lib/avoid";
import { recipeSteps } from "../lib/catalogue";
import { decimal, formatQuantity, mealHue } from "../lib/format";
import { baseServings, scaleQuantity, type CookSlot } from "../lib/planning";
import { useStore } from "../store/StoreProvider";
import { MealForm } from "./MealForm";
import { MealTags, mealGradient } from "./MealTags";
import { Sheet } from "./Sheet";
import { StepText } from "./StepText";
import { useUi } from "./UiProvider";

interface Props {
  mealId: string;
  slot?: CookSlot;
  onClose: () => void;
}

export function RecipeSheet({ mealId, slot, onClose }: Props) {
  const { state, catalogue, dispatch } = useStore();
  const { openCookMode, openSheet } = useUi();
  const meal = catalogue.get(mealId);
  if (!meal) return null;
  const factor = slot?.factor ?? 1;
  const rating = state.ratings[meal.id];
  const steps = recipeSteps(meal);

  const servings = slot
    ? `Quantités adaptées à ton planning : ${decimal(slot.portions)} portion${slot.portions > 1 ? "s" : ""}${meal.quiche && factor > 1 ? ` (${factor} quiches)` : ""}, restes compris.`
    : `Recette de base pour environ ${decimal(baseServings(meal))} portions${meal.quiche ? " (une quiche = 6 parts)" : ""}. Les quantités s’adaptent dans le planning.`;

  const rate = (value: 1 | -1) => dispatch({ type: "rate", id: meal.id, rating: rating === value ? null : value });

  return (
    <Sheet onClose={onClose} labelledBy="recipe-title">
      <div className="top" style={{ background: mealGradient(mealHue(meal), 78) }}>
        <span aria-hidden="true">{meal.emoji}</span>
        <button className="x" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </div>
      <div className="in">
        <h2 id="recipe-title">{meal.name}</h2>
        <MealTags meal={meal} />
        {avoidedIn(meal, state.settings.avoid).length > 0 && (
          <div className="warn">⚠ Contient {avoidedIn(meal, state.settings.avoid).join(", ").toLowerCase()}, que tu évites.</div>
        )}
        {steps.length > 0 && (
          <button className="cta cook" onClick={() => openCookMode(meal.id, slot)}>
            👩‍🍳 Mode cuisine
          </button>
        )}
        <h5>Ingrédients</h5>
        <ul>
          {meal.ingredients.map(([name, quantity, unit]) => (
            <li key={`${name}|${unit}`}>
              <span>{name}</span>
              <span>{formatQuantity(scaleQuantity(quantity, unit, factor), unit)}</span>
            </li>
          ))}
        </ul>
        <p className="note spaced">Plus sel, poivre et huile. {servings} Un enfant compte pour une demi-portion.</p>
        <h5>Recette</h5>
        <ol>
          {steps.map((step, i) => (
            <li key={i}>
              <StepText step={step} factor={factor} />
            </li>
          ))}
        </ol>
        <h5>Et chez vous ?</h5>
        <div className="feedback">
          <button className={`pill${rating === 1 ? " on" : ""}`} aria-pressed={rating === 1} onClick={() => rate(1)}>
            😋 On adore
          </button>
          <button className={`pill${rating === -1 ? " on" : ""}`} aria-pressed={rating === -1} onClick={() => rate(-1)}>
            😕 Bof
          </button>
          <button
            className={`pill${state.kidsLike[meal.id] ? " on" : ""}`}
            aria-pressed={!!state.kidsLike[meal.id]}
            onClick={() => dispatch({ type: "setKidsLike", id: meal.id, value: !state.kidsLike[meal.id] })}
          >
            🧒 Les enfants aiment
          </button>
        </div>
        <p className="note spaced">Les coups de cœur passent en premier, dans les cartes comme dans le planning.</p>
        {meal.custom && (
          <button className="cta ghost" onClick={() => openSheet((close) => <MealForm meal={meal} onClose={close} />)}>
            ✏️ Modifier ce plat
          </button>
        )}
      </div>
    </Sheet>
  );
}
