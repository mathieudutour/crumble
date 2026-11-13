import { useEffect, useRef, useState } from "react";
import { recipeSteps } from "../lib/catalogue";
import { formatQuantity } from "../lib/format";
import { scaleQuantity, type CookSlot } from "../lib/planning";
import { stepParts } from "../lib/steps";
import { useStore } from "../store/StoreProvider";
import { StepText } from "./StepText";
import { TimerList, useTimers } from "./Timers";

interface Props {
  mealId: string;
  slot?: CookSlot;
  onClose: () => void;
}

/** Keeps the screen on while cooking, re-acquired when the page comes back to the foreground. */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    let active = true;
    const acquire = async () => {
      try {
        if (active && document.visibilityState === "visible") lock = await navigator.wakeLock?.request("screen");
      } catch {
        // Unsupported or refused (low battery): the screen may sleep.
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, []);
}

/** Full-screen, one step at a time, with timers for every duration a step mentions. */
export function CookMode({ mealId, slot, onClose }: Props) {
  const { catalogue } = useStore();
  const { start } = useTimers();
  const meal = catalogue.get(mealId);
  const steps = meal ? recipeSteps(meal) : [];
  const factor = slot?.factor ?? 1;
  const [index, setIndex] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useWakeLock();

  const last = index === steps.length - 1;
  const step = steps[index] ?? "";

  useEffect(() => {
    root.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(steps.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose, steps.length]);

  if (!meal) return null;

  return (
    <div
      ref={root}
      className="cook-mode"
      role="dialog"
      aria-modal="true"
      aria-label={`Mode cuisine : ${meal.name}`}
      tabIndex={-1}
    >
      <header className="cook-head">
        <button className="x" onClick={onClose} aria-label="Quitter le mode cuisine">
          ✕
        </button>
        <div>
          <div className="cook-title">
            {meal.emoji} {meal.name}
          </div>
          <div className="note">
            Étape {index + 1} sur {steps.length}
          </div>
        </div>
        <button
          className={`pill${showIngredients ? " on" : ""}`}
          aria-expanded={showIngredients}
          onClick={() => setShowIngredients((v) => !v)}
        >
          Ingrédients
        </button>
      </header>
      <div className="cook-progress" aria-hidden="true">
        <i style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
      </div>

      {showIngredients ? (
        <ul className="cook-ingredients">
          {meal.ingredients.map(([name, quantity, unit]) => (
            <li key={`${name}|${unit}`}>
              <span>{name}</span>
              <span>{formatQuantity(scaleQuantity(quantity, unit, factor), unit)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cook-step" aria-live="polite">
          <StepText
            step={step}
            factor={factor}
            onTimer={(seconds) => start(`${meal.name} · étape ${index + 1}`, seconds)}
          />
        </p>
      )}
      {!showIngredients &&
        stepParts(step, factor).some((part) => typeof part !== "string" && part.kind === "timer") && (
          <p className="note cook-hint">Touche une durée pour lancer un minuteur.</p>
        )}

      <TimerList />
      <footer className="cook-nav">
        <button className="cta ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          ‹ Précédent
        </button>
        <button className="cta" onClick={() => (last ? onClose() : setIndex(index + 1))}>
          {last ? "Terminé ✓" : "Suivant ›"}
        </button>
      </footer>
    </div>
  );
}
