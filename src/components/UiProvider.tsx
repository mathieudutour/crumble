import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { copyText } from "../lib/clipboard";
import type { CookSlot } from "../lib/planning";
import { CookMode } from "./CookMode";
import { RecipeSheet } from "./RecipeSheet";

type SheetRenderer = (close: () => void) => ReactNode;

interface Ui {
  toast: (message: string) => void;
  copy: (text: string) => Promise<void>;
  /** Shows one bottom sheet at a time, replacing any open one. */
  openSheet: (render: SheetRenderer) => void;
  /** With a plan slot, quantities are scaled to that slot's portions. */
  openRecipe: (mealId: string, slot?: CookSlot) => void;
  openCookMode: (mealId: string, slot?: CookSlot) => void;
}

const UiContext = createContext<Ui | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<number>(undefined);
  const [sheet, setSheet] = useState<SheetRenderer | null>(null);
  const [cooking, setCooking] = useState<{ mealId: string; slot?: CookSlot } | null>(null);

  const toast = useCallback((message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastVisible(false), 1800);
  }, []);

  const closeSheet = useCallback(() => setSheet(null), []);

  const ui = useMemo<Ui>(() => {
    // Wrapped so React stores the renderer instead of calling it as a state updater.
    const openSheet = (render: SheetRenderer) => setSheet(() => render);
    return {
      toast,
      copy: async (text) => toast((await copyText(text)) ? "Copié" : "Copie impossible ici"),
      openSheet,
      openRecipe: (mealId, slot) => openSheet((close) => <RecipeSheet mealId={mealId} slot={slot} onClose={close} />),
      openCookMode: (mealId, slot) => {
        setSheet(null);
        setCooking({ mealId, slot });
      },
    };
  }, [toast]);

  return (
    <UiContext.Provider value={ui}>
      {children}
      {sheet?.(closeSheet)}
      {cooking && <CookMode mealId={cooking.mealId} slot={cooking.slot} onClose={() => setCooking(null)} />}
      <div className={`toast${toastVisible ? " on" : ""}`} role="status" aria-live="polite">
        {toastMessage}
      </div>
    </UiContext.Provider>
  );
}

export function useUi(): Ui {
  const ui = useContext(UiContext);
  if (!ui) throw new Error("useUi must be used inside <UiProvider>");
  return ui;
}
