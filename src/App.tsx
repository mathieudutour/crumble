import { useEffect } from "react";
import { useSuggestInstall } from "./components/InstallHint";
import { JoinSheet, statusLabel } from "./components/Sharing";
import { useUi } from "./components/UiProvider";
import { hrefOf, useView, VIEWS } from "./lib/router";
import { monthTitle } from "./lib/season";
import { seasonMonthOf } from "./lib/week";
import { useStore } from "./store/StoreProvider";
import { HouseholdView } from "./views/HouseholdView";
import { MineView } from "./views/MineView";
import { PlanView } from "./views/PlanView";
import { ShopView } from "./views/ShopView";
import { SwipeView } from "./views/SwipeView";

/** Invitation links look like `/#rejoindre=<key>`: the key stays in the browser, never in server logs. */
const JOIN_PREFIX = "#rejoindre=";

export function App() {
  const { state, status, household } = useStore();
  const { toast, openSheet } = useUi();
  const [view, navigate] = useView();
  const suggestInstall = useSuggestInstall();
  const toPlan = () => navigate("plan");
  const toSwipe = () => navigate("swipe");

  useEffect(() => {
    household.onNotice = toast;
  }, [household, toast]);

  useEffect(() => {
    const checkInvite = () => {
      if (!location.hash.startsWith(JOIN_PREFIX)) return;
      const key = decodeURIComponent(location.hash.slice(JOIN_PREFIX.length));
      history.replaceState(null, "", location.pathname);
      if (status.mode === "household" && status.key === key) return toast("Tu fais déjà partie de ce foyer");
      openSheet((close) => (
        <JoinSheet
          joinKey={key}
          onDone={(joined) => {
            close();
            if (joined) {
              toast("Bienvenue dans le foyer !");
              navigate("plan");
              suggestInstall();
            }
          }}
        />
      ));
    };
    checkInvite();
    addEventListener("hashchange", checkInvite);
    return () => removeEventListener("hashchange", checkInvite);
  }, [status, toast, openSheet, navigate, suggestInstall]);

  return (
    <div className="app">
      <header>
        <h1>Crumble</h1>
        <span className="month">
          {monthTitle(seasonMonthOf(state.week))}
          {status.mode === "household" && (
            <a
              href={hrefOf("home")}
              className={`sync-badge ${status.connection}${status.joined ? "" : " joining"}`}
              title={statusLabel(status)}
              aria-label={`Foyer partagé : ${statusLabel(status)}`}
            >
              👥<i aria-hidden="true" />
            </a>
          )}
        </span>
      </header>
      <nav className="tabs" aria-label="Sections">
        {VIEWS.map((v) => (
          <a
            key={v.id}
            href={hrefOf(v.id)}
            className={v.id === view ? "on" : undefined}
            aria-current={v.id === view ? "page" : undefined}
          >
            {v.label}
          </a>
        ))}
      </nav>
      <main className="view">
        {view === "swipe" && <SwipeView onPlan={toPlan} />}
        {view === "plan" && <PlanView onSwipe={toSwipe} onShop={() => navigate("shop")} />}
        {view === "shop" && <ShopView />}
        {view === "mine" && <MineView />}
        {view === "home" && <HouseholdView onPlan={toPlan} onSwipe={toSwipe} />}
      </main>
    </div>
  );
}
