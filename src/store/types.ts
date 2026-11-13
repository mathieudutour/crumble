// Kept apart from store.ts, which uses browser APIs, so the Worker can share the code that uses these types.

import type { Household, HouseholdAction } from "../shared/household";
import type { Swipe } from "./swipes";

/** What the app shows: the household, plus this phone's swipe history for undo. */
export type AppState = Household & { swipes: Swipe[] };

/** `undo` only exists on this phone: it undoes this phone's last swipe, never the other person's. */
export type Action = HouseholdAction | { type: "undo" };
