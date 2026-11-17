import { Drawer } from "@base-ui/react/drawer";
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { copyText } from "../lib/clipboard";
import type { CookSlot } from "../lib/planning";
import { CookMode } from "./CookMode";
import { RecipeSheet } from "./RecipeSheet";
import { SheetPresence } from "./Sheet";

type SheetRenderer = (close: () => void) => ReactNode;

/** A button in the toast: « Annuler » for a plain function. */
export type ToastAction = (() => void) | { label: string; run: () => void };

interface Ui {
  toast: (message: string, action?: ToastAction) => void;
  copy: (text: string) => Promise<void>;
  /** Shows one bottom sheet at a time, replacing any open one. */
  openSheet: (render: SheetRenderer) => void;
  /** With a plan slot, quantities are scaled to that slot's portions. */
  openRecipe: (mealId: string, slot?: CookSlot) => void;
  openCookMode: (mealId: string, slot?: CookSlot) => void;
}

const UiContext = createContext<Ui | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{
    text: string;
    action?: { label: string; run: () => void };
  } | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<number>(undefined);
  // The sheet stays mounted while it animates out: `open` turns false first, then it's dropped once closed.
  const [sheet, setSheet] = useState<{ render: SheetRenderer; key: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [cooking, setCooking] = useState<{ mealId: string; slot?: CookSlot } | null>(null);

  const toast = useCallback((text: string, action?: ToastAction) => {
    setMessage({
      text,
      action: typeof action === "function" ? { label: "Annuler", run: action } : action,
    });
    setToastVisible(true);
    clearTimeout(toastTimer.current);
    // Long enough to read and reach the button when there is one.
    toastTimer.current = window.setTimeout(() => setToastVisible(false), action ? 5000 : 1800);
  }, []);

  const closeSheet = useCallback(() => setOpen(false), []);
  const presence = useMemo(() => ({ open, onClosed: () => setSheet(null) }), [open]);

  const ui = useMemo<Ui>(() => {
    const openSheet = (render: SheetRenderer) => {
      // The page shrinks back around what's on screen, not around the top of the document.
      document.documentElement.style.setProperty("--page-scroll", `${scrollY}px`);
      // A new key replays the opening animation when a sheet replaces another.
      setSheet((current) => ({ render, key: (current?.key ?? 0) + 1 }));
      setOpen(true);
    };
    return {
      toast,
      copy: async (text) => toast((await copyText(text)) ? "Copié" : "Copie impossible ici"),
      openSheet,
      openRecipe: (mealId, slot) =>
        openSheet((close) => <RecipeSheet mealId={mealId} slot={slot} onClose={close} />),
      openCookMode: (mealId, slot) => {
        setOpen(false);
        setCooking({ mealId, slot });
      },
    };
  }, [toast]);

  return (
    <UiContext.Provider value={ui}>
      <Drawer.Provider>
        {/* While a sheet is open, the page shrinks back over a dark background, as on iOS. */}
        <Drawer.IndentBackground className="page-indent-background" />
        <Drawer.Indent className="page-indent">{children}</Drawer.Indent>
        <SheetPresence.Provider value={presence}>
          {sheet && <Fragment key={sheet.key}>{sheet.render(closeSheet)}</Fragment>}
        </SheetPresence.Provider>
      </Drawer.Provider>
      {cooking && (
        <CookMode mealId={cooking.mealId} slot={cooking.slot} onClose={() => setCooking(null)} />
      )}
      <div className={`toast${toastVisible ? " on" : ""}`} role="status" aria-live="polite">
        <span>{message?.text}</span>
        {message?.action && (
          <button
            onClick={() => {
              message.action?.run();
              setToastVisible(false);
            }}
          >
            {message.action.label}
          </button>
        )}
      </div>
    </UiContext.Provider>
  );
}

export function useUi(): Ui {
  const ui = useContext(UiContext);
  if (!ui) throw new Error("useUi must be used inside <UiProvider>");
  return ui;
}
