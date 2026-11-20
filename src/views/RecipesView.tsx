import { useState } from "react";
import { AddToPlanSheet } from "../components/AddToPlan";
import { DishThumb } from "../components/DishArt";
import { MealForm } from "../components/MealForm";
import { SwipeRow, type SwipeAction } from "../components/SwipeRow";
import { useUi } from "../components/UiProvider";
import type { Course, Meal } from "../data/types";
import { courseOf } from "../lib/catalogue";
import { typeLabel } from "../lib/format";
import { shuffle } from "../lib/random";
import { isInSeason } from "../lib/season";
import { seasonMonthOf } from "../lib/week";
import { useStore } from "../store/StoreProvider";
import { fitsHousehold } from "../store/selectors";

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const GROUPS: { course: Course; title: string; add: string; empty: string }[] = [
  { course: "plat", title: "Plats", add: "+ Ajouter un plat", empty: "Aucun plat." },
  {
    course: "entree",
    title: "Entrées",
    add: "+ Ajouter une entrée",
    empty: "Pas encore d’entrée : ajoute celles de la maison.",
  },
  {
    course: "dessert",
    title: "Desserts",
    add: "+ Ajouter un dessert",
    empty: "Pas encore de dessert : ajoute ceux de la maison.",
  },
];

function RecipeRow({ meal }: { meal: Meal }) {
  const { state, dispatch } = useStore();
  const { openRecipe, openSheet, toast } = useUi();
  const liked = state.liked.includes(meal.id);
  const noped = state.noped.includes(meal.id);
  const choose = (keep: boolean) => {
    dispatch({ type: keep ? "like" : "unlike", id: meal.id });
    toast(keep ? `Gardé : ${meal.name}` : `Écarté : ${meal.name}`, () =>
      dispatch(
        liked
          ? { type: "like", id: meal.id }
          : noped
            ? { type: "unlike", id: meal.id }
            : { type: "unswipe", id: meal.id },
      ),
    );
  };
  const notes = [
    meal.course ? "" : typeLabel(meal),
    meal.custom ? "de la maison" : "",
    liked ? "♥ gardé" : "",
    !isInSeason(meal, seasonMonthOf(state.week)) ? "hors saison" : "",
    !fitsHousehold(state, meal) ? "mis de côté par tes réglages" : "",
  ].filter(Boolean);
  const badges = [state.ratings[meal.id] === 1 ? "😋" : "", state.kidsLike[meal.id] ? "🧒" : ""].join("");
  // Main dishes are kept or set aside, as in the cards. Starters and desserts aren't swiped.
  const actions: SwipeAction[] =
    meal.course || meal.type === "fixed"
      ? []
      : [
          ...(liked ? [] : [{ label: "Garder", tone: "accent" as const, run: () => choose(true) }]),
          ...(noped ? [] : [{ label: "Écarter", tone: "danger" as const, run: () => choose(false) }]),
        ];
  const row = (
    <div className="pick">
      <button className="pick-open" onClick={() => openRecipe(meal.id)}>
        <DishThumb meal={meal} />
        <span className="nm">
          {meal.name} {badges}
          {notes.length > 0 && (
            <>
              <br />
              <span className="note">{notes.join(" · ")}</span>
            </>
          )}
        </span>
      </button>
      <button
        className="round small add-to-plan"
        aria-label={`Ajouter ${meal.name} au planning`}
        onClick={() => openSheet((close) => <AddToPlanSheet mealId={meal.id} onClose={close} />)}
      >
        +
      </button>
    </div>
  );
  return actions.length ? <SwipeRow actions={actions}>{row}</SwipeRow> : row;
}

/** Every recipe, the household's own included, by course, with the ones set aside last. */
export function RecipesView() {
  const { state, catalogue, dispatch } = useStore();
  const { openSheet } = useUi();
  const [query, setQuery] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const recipes = catalogue.all
    .filter((m) => {
      const text = normalize([m.name, ...m.ingredients.map(([name]) => name)].join(" "));
      return words.every((w) => text.includes(w));
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const noped = recipes.filter((m) => state.noped.includes(m.id));

  return (
    <>
      <input
        className="field recipe-search"
        type="search"
        placeholder="Chercher une recette ou un ingrédient"
        aria-label="Chercher une recette"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {GROUPS.map(({ course, title, add, empty }) => {
        const meals = recipes.filter((m) => courseOf(m) === course && !state.noped.includes(m.id));
        if (words.length && !meals.length) return null;
        return (
          <section key={course} className="recipe-group">
            <h2 className="section-title">
              {title} ({meals.length})
            </h2>
            {meals.length ? (
              meals.map((meal) => <RecipeRow key={meal.id} meal={meal} />)
            ) : (
              <p className="note">{empty}</p>
            )}
            {!words.length && (
              <button
                className="cta ghost"
                onClick={() => openSheet((close) => <MealForm course={course} onClose={close} />)}
              >
                {add}
              </button>
            )}
          </section>
        );
      })}
      {(noped.length > 0 || !words.length) && (
        <section className="recipe-group">
          <h2 className="section-title">Écartés ({noped.length})</h2>
          {noped.length ? (
            noped.map((meal) => <RecipeRow key={meal.id} meal={meal} />)
          ) : (
            <p className="note">Les plats que tu écartes dans les cartes arrivent ici.</p>
          )}
        </section>
      )}
      {words.length > 0 && !recipes.length && <p className="note spaced">Aucune recette ne correspond.</p>}

      {!words.length && (
        <>
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
            Remet tous les plats dans les cartes. Les plannings, notes et recettes ajoutées restent.
          </p>
        </>
      )}
    </>
  );
}
