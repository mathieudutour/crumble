import { useCallback, useEffect, useRef } from "react";
import { Counts } from "../components/Counts";
import { EmptyState } from "../components/EmptyState";
import { flyOut, SwipeCard } from "../components/SwipeCard";
import { useUi } from "../components/UiProvider";
import { plural } from "../lib/format";
import { useStore } from "../store/StoreProvider";
import { counts, isReady, remainingIds, required } from "../store/selectors";

/** Matches the fly-out transition so the deck updates once the card has left. */
const FLY_OUT_MS = 300;


export function SwipeView({ onPlan }: { onPlan: () => void }) {
  const { state, catalogue, dispatch, buildPlan } = useStore();
  const { openRecipe, toast } = useUi();
  const remaining = remainingIds(state, catalogue);
  const topId = remaining[0];
  const topCard = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const hasPlan = !!state.plans[state.week];

  const ready = isReady(state, catalogue);
  const wasReady = useRef(ready);
  useEffect(() => {
    if (ready && !wasReady.current) toast("Assez de plats pour un planning ✨");
    wasReady.current = ready;
  }, [ready, toast]);

  const decide = useCallback(
    (liked: boolean, dy = 0) => {
      const card = topCard.current;
      if (busy.current || !card || !topId) return;
      busy.current = true;
      flyOut(card, liked, dy);
      setTimeout(() => {
        dispatch({ type: "swipe", id: topId, liked });
        busy.current = false;
      }, FLY_OUT_MS);
    },
    [dispatch, topId],
  );

  // Arrow keys swipe on desktop, unless a sheet or the cooking mode is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector(".sheet-bg, .cook-mode")) return;
      if (e.key === "ArrowRight") decide(true);
      else if (e.key === "ArrowLeft") decide(false);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [decide]);

  const have = counts(state, catalogue);
  const need = required(state, catalogue);
  const missing = [
    need.dinners > have.dinners ? plural(need.dinners - have.dinners, "dîner") : "",
    need.lunches > have.lunches ? plural(need.lunches - have.lunches, "midi") : "",
  ].filter(Boolean);

  return (
    <>
      <Counts />
      <div className="deck">
        {topId ? (
          remaining
            .slice(0, 3)
            .reverse()
            .map((id, index, shown) => {
              const depth = shown.length - 1 - index;
              const meal = catalogue.get(id)!;
              return (
                <SwipeCard
                  key={id}
                  meal={meal}
                  depth={depth}
                  ref={depth === 0 ? topCard : undefined}
                  onTap={() => openRecipe(id)}
                  onSwipe={decide}
                />
              );
            })
        ) : (
          <EmptyState scene="deck-done" icon="🍽" title="Tu as tout vu !">
            <p className="note">
              {state.noped.length ? "Tu peux revoir les plats écartés ou créer ton planning." : "Crée ton planning."}
            </p>
            {state.noped.length > 0 && (
              <button className="cta ghost inline" onClick={() => dispatch({ type: "reviewNoped" })}>
                Revoir les plats écartés
              </button>
            )}
          </EmptyState>
        )}
      </div>
      <div className="actions">
        <button
          className="round small"
          onClick={() => dispatch({ type: "undo" })}
          disabled={!state.swipes.length}
          aria-label="Annuler"
          title="Annuler"
        >
          ↶
        </button>
        <button
          className="round no"
          onClick={() => decide(false)}
          disabled={!topId}
          aria-label="Passer"
          title="Passer (←)"
        >
          ✕
        </button>
        <button
          className="round yes"
          onClick={() => decide(true)}
          disabled={!topId}
          aria-label="Garder"
          title="Garder (→)"
        >
          ♥
        </button>
      </div>
      {hasPlan ? (
        <button className="cta" onClick={onPlan}>
          Voir mon planning →
        </button>
      ) : (
        <button
          className="cta"
          disabled={!ready}
          onClick={() => {
            buildPlan();
            onPlan();
          }}
        >
          {ready ? "Créer mon planning ✨" : `Encore ${missing.join(" et ")} à choisir`}
        </button>
      )}
    </>
  );
}
