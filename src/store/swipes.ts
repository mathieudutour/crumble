import type { Household } from "../shared/household";

/** A swipe made on this phone, kept for undo. */
export interface Swipe {
  id: string;
  liked: boolean;
}

export const isSwipe = (value: unknown): value is Swipe =>
  !!value && typeof (value as Swipe).id === "string" && typeof (value as Swipe).liked === "boolean";

/**
 * The swipe undo reverts: this phone's latest one that still stands. Swipes another phone has since overridden
 * (both people deciding on the same card at once) are skipped, so undo never reverts someone else's decision.
 */
export function popUndo(
  swipes: readonly Swipe[],
  state: Pick<Household, "liked" | "noped">,
): { swipes: Swipe[]; undo?: Swipe } {
  const rest = [...swipes];
  for (let swipe = rest.pop(); swipe; swipe = rest.pop()) {
    if ((swipe.liked ? state.liked : state.noped).includes(swipe.id)) return { swipes: rest, undo: swipe };
  }
  return { swipes: rest };
}
