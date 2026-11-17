import { useEffect, useRef, useState, type ReactNode } from "react";

export interface SwipeAction {
  label: string;
  tone: "danger" | "neutral" | "accent";
  run: () => void;
}

/** Width of one revealed action. */
const ACTION_WIDTH = 84;
/** Past this share of the row's width, letting go runs the last action, as a full swipe in iOS lists does. */
const FULL_SWIPE = 0.55;

/** Only one row shows its actions at a time: opening one closes the other. Rows are told apart by a stable ref. */
let openRow: { current: () => void } | null = null;

/**
 * A row that slides left on touch to reveal its actions, as in iOS lists; swiping far (or fast) runs the last one. A
 * mouse doesn't swipe: the same actions are buttons in the row or its sheet. Plain pointer events and a CSS
 * transition, so no animation library.
 */
export function SwipeRow({ actions, children }: { actions: SwipeAction[]; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const [x, setXState] = useState(0);
  const xRef = useRef(0);
  const setX = (value: number) => {
    xRef.current = value;
    setXState(value);
  };
  const [dragging, setDragging] = useState(false);
  const self = useRef(() => {});
  const isOpen = x < 0 && !dragging;
  const close = () => {
    setX(0);
    if (openRow === self) openRow = null;
  };
  self.current = close;
  const revealedWidth = actions.length * ACTION_WIDTH;
  const rowWidth = () => content.current?.offsetWidth ?? 360;
  const full = -x > Math.max(revealedWidth * 1.4, rowWidth() * 0.45);

  // Scrolling closes the open row, as on iOS.
  useEffect(() => {
    if (!isOpen) return;
    const onScroll = () => close();
    addEventListener("scroll", onScroll, { passive: true, once: true });
    return () => removeEventListener("scroll", onScroll);
  });

  const runLast = () => {
    setX(-rowWidth());
    // Let the row slide out before it changes or goes away.
    setTimeout(() => {
      actions[actions.length - 1]!.run();
      setX(0);
    }, 180);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch") return;
    const start = { x: event.clientX, y: event.clientY };
    const base = xRef.current;
    const width = rowWidth();
    let direction: "x" | "y" | null = null;
    let last = { x: event.clientX, t: event.timeStamp };
    let velocity = 0;

    const move = (e: PointerEvent) => {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!direction) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // The first clear direction decides: vertical is a scroll, and stays one.
        direction = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (direction === "x") setDragging(true);
      }
      if (direction !== "x") return;
      velocity = (e.clientX - last.x) / Math.max(1, e.timeStamp - last.t);
      last = { x: e.clientX, t: e.timeStamp };
      const next = base + dx;
      // A little give past the closed position, as iOS does.
      setX(next > 0 ? next * 0.15 : Math.max(-width, next));
    };
    const end = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", end);
      removeEventListener("pointercancel", end);
      if (direction !== "x") return;
      setDragging(false);
      const offset = xRef.current;
      if (offset < -width * FULL_SWIPE || (velocity < -1.2 && offset < -ACTION_WIDTH)) runLast();
      else if (offset < -ACTION_WIDTH * 0.6) {
        setX(-revealedWidth);
        if (openRow && openRow !== self) openRow.current();
        openRow = self;
      } else close();
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", end);
    addEventListener("pointercancel", end);
  };

  return (
    <div className="swipe-row">
      <div
        className={`swipe-actions${full ? " full" : ""}`}
        style={{ width: Math.max(0, -x) }}
        aria-hidden={!isOpen}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            className={`swipe-action ${action.tone}`}
            tabIndex={isOpen ? 0 : -1}
            onClick={() => {
              close();
              action.run();
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
      <div
        ref={content}
        className={`swipe-content${dragging ? " dragging" : ""}`}
        style={{ transform: x ? `translateX(${x}px)` : undefined }}
        onPointerDown={onPointerDown}
        // While open, a tap anywhere on the row closes the actions instead of acting.
        onClickCapture={(e) => {
          if (!isOpen) return;
          e.stopPropagation();
          e.preventDefault();
          close();
        }}
      >
        {children}
      </div>
    </div>
  );
}
