import { DishThumb } from "../components/DishArt";
import { useState } from "react";
import { Counts } from "../components/Counts";
import { MealForm } from "../components/MealForm";
import { useUi } from "../components/UiProvider";
import { typeLabel } from "../lib/format";
import { shuffle } from "../lib/random";
import { useStore } from "../store/StoreProvider";
import { isAvailable } from "../store/selectors";

function MealPick({ id, action }: { id: string; action: "unlike" | "like" | "edit" }) {
  const { state, catalogue, dispatch } = useStore();
  const { openRecipe, openSheet } = useUi();
  const meal = catalogue.get(id);
  if (!meal) return null;
  const badges = [state.ratings[id] === 1 ? "😋" : "", state.kidsLike[id] ? "🧒" : ""].join("");
  return (
    <div className="pick">
      <button className="pick-open" onClick={() => openRecipe(id)}>
        <DishThumb meal={meal} />
        <span className="nm">
          {meal.name} {badges}
          <br />
          <span className="note">{typeLabel(meal)}</span>
        </span>
      </button>
      {action === "edit" ? (
        <button className="pill" onClick={() => openSheet((close) => <MealForm meal={meal} onClose={close} />)}>
          Modifier
        </button>
      ) : (
        <button className="pill" onClick={() => dispatch({ type: action, id })}>
          {action === "unlike" ? "Écarter" : "♥ Garder"}
        </button>
      )}
    </div>
  );
}

export function MineView() {
  const { state, catalogue, dispatch } = useStore();
  const { openSheet } = useUi();
  const [confirmReset, setConfirmReset] = useState(false);
  const available = (ids: string[]) => ids.filter((id) => isAvailable(state, catalogue.get(id)));
  const liked = available(state.liked);
  const noped = available(state.noped);
  const hidden = state.liked.length - liked.length;

  return (
    <>
      <Counts />
      <h2>Gardés ({liked.length})</h2>
      {liked.length ? (
        liked.map((id) => <MealPick key={id} id={id} action="unlike" />)
      ) : (
        <p className="note">Rien pour l’instant.</p>
      )}
      {hidden > 0 && (
        <p className="note spaced">
          {hidden > 1 ? `${hidden} plats gardés reviendront` : "1 plat gardé reviendra"} avec leur saison
          {Object.values(state.settings.diet).some(Boolean) || state.settings.avoid.length
            ? " (ou sont mis de côté par tes réglages, onglet « Foyer »)"
            : ""}
          .
        </p>
      )}
      <h2 className="section-title">Écartés ({noped.length})</h2>
      {noped.length ? (
        noped.map((id) => <MealPick key={id} id={id} action="like" />)
      ) : (
        <p className="note">Rien pour l’instant.</p>
      )}

      <h2 className="section-title">Mes plats ({state.customMeals.length})</h2>
      <p className="note spaced-bottom">
        Ajoute les recettes de la maison : elles entrent dans le planning et la liste de courses comme les autres.
      </p>
      {state.customMeals.map((meal) => (
        <MealPick key={meal.id} id={meal.id} action="edit" />
      ))}
      <button className="cta ghost" onClick={() => openSheet((close) => <MealForm onClose={close} />)}>
        + Ajouter un plat
      </button>

      <button
        className={`cta ghost reset${confirmReset ? " armed" : ""}`}
        onClick={() => {
          if (!confirmReset) return setConfirmReset(true);
          dispatch({ type: "resetChoices", order: shuffle(catalogue.swipeable.map((m) => m.id)) });
          setConfirmReset(false);
        }}
        onBlur={() => setConfirmReset(false)}
      >
        {confirmReset ? "Sûr ? Touche encore pour tout revoir" : "Recommencer mes choix"}
      </button>
      <p className="note spaced">
        Remet tous les plats dans les cartes. Les plannings, notes et plats ajoutés restent.
      </p>
    </>
  );
}
