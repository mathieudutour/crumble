import { describe, expect, it } from "vitest";
import { popUndo } from "./swipes";

describe("popUndo", () => {
  it("undoes this phone's latest swipe", () => {
    const { undo, swipes } = popUndo(
      [
        { id: "a", liked: true },
        { id: "b", liked: false },
      ],
      { liked: ["a"], noped: ["b"] },
    );
    expect(undo).toEqual({ id: "b", liked: false });
    expect(swipes).toEqual([{ id: "a", liked: true }]);
  });

  it("skips a swipe the other person overrode, instead of undoing their decision", () => {
    // This phone kept "b", the other phone passed on it right after.
    const { undo } = popUndo(
      [
        { id: "a", liked: true },
        { id: "b", liked: true },
      ],
      { liked: ["a"], noped: ["b"] },
    );
    expect(undo).toEqual({ id: "a", liked: true });
  });

  it("does nothing when no swipe still stands", () => {
    expect(popUndo([{ id: "a", liked: true }], { liked: [], noped: [] })).toEqual({ swipes: [] });
  });
});
