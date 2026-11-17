import { Drawer } from "@base-ui/react/drawer";
import { createContext, useContext, useRef, type ReactNode } from "react";

/** Whether the current sheet is open, and what to call once its closing animation is over. Set by the UiProvider. */
export const SheetPresence = createContext<{ open: boolean; onClosed: () => void }>({
  open: true,
  onClosed: () => {},
});

interface Props {
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}

/**
 * A bottom sheet (Base UI's Drawer): it slides up with the page shrinking back behind it, follows the finger, and
 * closes when swiped down, on Escape or with a tap outside. The element marked `data-autofocus` gets focus on open.
 */
export function Sheet({ onClose, labelledBy, children }: Props) {
  const { open, onClosed } = useContext(SheetPresence);
  const popup = useRef<HTMLDivElement>(null);
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => !next && onClose()}
      onOpenChangeComplete={(next) => !next && onClosed()}
    >
      {/* Keeps focused fields above the software keyboard. */}
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
          <Drawer.Backdrop className="sheet-backdrop" />
          <Drawer.Viewport className="sheet-viewport">
            <Drawer.Popup
              ref={popup}
              className="sheet"
              aria-labelledby={labelledBy}
              initialFocus={() =>
                popup.current?.querySelector<HTMLElement>("[data-autofocus]") ?? true
              }
              // Focus goes back to what opened the sheet for keyboard users on a computer; on a phone it would only
              // leave a focus ring on the button.
              finalFocus={(type) => type === "keyboard" && matchMedia("(hover: hover)").matches}
            >
              <div className="grabber" aria-hidden="true" />
              <Drawer.Content className="sheet-scroll">{children}</Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}

export function SheetHeader({
  id,
  title,
  onClose,
}: {
  id: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="sheet-head">
      <h2 id={id}>{title}</h2>
      <button className="x" onClick={onClose} aria-label="Fermer">
        ✕
      </button>
    </div>
  );
}
