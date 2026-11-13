import { useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { useUi } from "../components/UiProvider";
import { AISLE_NAMES } from "../data/aisles";
import { formatQuantity } from "../lib/format";
import { shoppingList, shoppingText, splitPantry } from "../lib/shopping";
import { weekName, weekRange } from "../lib/week";
import { useStore } from "../store/StoreProvider";

export function ShopView() {
  const { state, catalogue, dispatch } = useStore();
  const { copy, toast } = useUi();
  const [showPantry, setShowPantry] = useState(false);
  const plan = state.plans[state.week];
  const heading = (
    <p className="note spaced-bottom">
      {weekName(state.week)}, {weekRange(state.week)}
    </p>
  );

  if (!plan) {
    return (
      <>
        {heading}
        <EmptyState icon="🛒" title="La liste arrive avec le planning" inline>
          <p className="note">Crée d’abord ton planning.</p>
        </EmptyState>
      </>
    );
  }

  const { toBuy, atHome } = splitPantry(shoppingList(plan.slots, catalogue.get), state.pantry);
  const togglePantry = (name: string, adding: boolean) => {
    dispatch({ type: "setPantry", name, value: adding });
    if (adding) toast(`${name} : toujours à la maison`);
  };

  return (
    <>
      {heading}
      <div className="row">
        <button className="cta ghost" onClick={() => copy(shoppingText(toBuy))}>
          Copier la liste
        </button>
        <button className="cta ghost" onClick={() => dispatch({ type: "clearChecked", week: state.week })}>
          Tout décocher
        </button>
      </div>
      {toBuy.map(({ aisle, items }) => (
        <section key={aisle}>
          <h3 className="aisle">{AISLE_NAMES[aisle]}</h3>
          {items.map((item) => {
            const done = !!plan.checked[item.key];
            return (
              <div key={item.key} className={`item${done ? " done" : ""}`}>
                <button
                  className="item-check"
                  role="checkbox"
                  aria-checked={done}
                  onClick={() => dispatch({ type: "setChecked", week: state.week, key: item.key, value: !done })}
                >
                  <span className="box" aria-hidden="true">
                    {done ? "✓" : ""}
                  </span>
                  <span className="nm">{item.name}</span>
                  <span className="q">{formatQuantity(item.quantity, item.unit)}</span>
                </button>
                <button
                  className="home"
                  onClick={() => togglePantry(item.name, true)}
                  aria-label={`${item.name} : j’en ai toujours`}
                  title="J’en ai toujours"
                >
                  🏠
                </button>
              </div>
            );
          })}
        </section>
      ))}
      {atHome.length > 0 && (
        <section className="pantry">
          <button className="aisle pantry-toggle" aria-expanded={showPantry} onClick={() => setShowPantry((v) => !v)}>
            🏠 Toujours à la maison ({atHome.length}) {showPantry ? "▴" : "▾"}
          </button>
          {showPantry &&
            atHome.map((item) => (
              <div key={item.key} className="item at-home">
                <span className="nm">{item.name}</span>
                <span className="q">{formatQuantity(item.quantity, item.unit)}</span>
                <button className="pill" onClick={() => togglePantry(item.name, false)}>
                  Remettre
                </button>
              </div>
            ))}
        </section>
      )}
      <p className="note spaced">
        Touche 🏠 pour ce que tu as toujours chez toi : ça ne revient plus dans la liste. À avoir aussi : sel, poivre,
        huile d’olive, moutarde, miel, sucre, cannelle, muscade, ail.
      </p>
    </>
  );
}
