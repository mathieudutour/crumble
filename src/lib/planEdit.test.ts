import { describe, expect, it } from "vitest";
import { makeCatalogue } from "./catalogue";
import { canMove, clearSlot, moveMeal, placeMeal, toggleLock } from "./planEdit";
import { defaultDiners, slotIndex, withPortions, type Plan, type PlanSlot } from "./planning";

const catalogue = makeCatalogue();
const meal = (id: string) => catalogue.get(id)!;
const diners = defaultDiners();

const cook = (mealId: string): PlanSlot => ({ kind: "cook", mealId, portions: 0, factor: 1 });
const FREE: PlanSlot = { kind: "free" };

const MON_DINNER = slotIndex(0, true);
const TUE_LUNCH = slotIndex(1, false);
const TUE_DINNER = slotIndex(1, true);
const WED_LUNCH = slotIndex(2, false);
const THU_DINNER = slotIndex(3, true);
const FRI_LUNCH = slotIndex(4, false);

/** Monday dinner: roast chicken, eaten again on Tuesday lunch. Everything else free. */
function week(): Plan {
  const slots: PlanSlot[] = Array.from({ length: 14 }, () => FREE);
  slots[MON_DINNER] = cook("poulet");
  slots[TUE_LUNCH] = { kind: "leftovers", mealId: "poulet", from: MON_DINNER };
  slots[TUE_DINNER] = cook("cabillaud");
  return withPortions(slots, diners, catalogue.get);
}

describe("placeMeal", () => {
  it("keeps the leftovers when swapping for another batch meal, and locks the choice", () => {
    const plan = placeMeal(week(), MON_DINNER, meal("hachis"), diners, catalogue.get);
    expect(plan[MON_DINNER]).toMatchObject({ mealId: "hachis", locked: true, portions: 4.5 });
    expect(plan[TUE_LUNCH]).toEqual({ kind: "leftovers", mealId: "hachis", from: MON_DINNER });
  });

  it("frees the leftovers when swapping for a meal that makes none", () => {
    const plan = placeMeal(week(), MON_DINNER, meal("risotto"), diners, catalogue.get);
    expect(plan[TUE_LUNCH]).toEqual(FREE);
    expect(plan[MON_DINNER]).toMatchObject({ portions: 2.5 });
  });

  it("books leftovers when a batch meal replaces one that made none", () => {
    const plan = placeMeal(week(), TUE_DINNER, meal("hachis"), diners, catalogue.get);
    expect(plan[WED_LUNCH]).toEqual({ kind: "leftovers", mealId: "hachis", from: TUE_DINNER });
  });
});

describe("moveMeal", () => {
  it("moves a meal to a free slot and re-books its leftovers after the new day", () => {
    const plan = moveMeal(week(), MON_DINNER, THU_DINNER, diners, catalogue.get);
    expect(plan[MON_DINNER]).toEqual(FREE);
    expect(plan[TUE_LUNCH]).toEqual(FREE);
    expect(plan[THU_DINNER]).toMatchObject({ mealId: "poulet", locked: true });
    expect(plan[FRI_LUNCH]).toEqual({ kind: "leftovers", mealId: "poulet", from: THU_DINNER });
  });

  it("swaps two cooked meals", () => {
    const plan = moveMeal(week(), MON_DINNER, TUE_DINNER, diners, catalogue.get);
    expect(plan[MON_DINNER]).toMatchObject({ mealId: "cabillaud" });
    expect(plan[TUE_DINNER]).toMatchObject({ mealId: "poulet" });
    expect(plan[WED_LUNCH]).toEqual({ kind: "leftovers", mealId: "poulet", from: TUE_DINNER });
  });

  it("refuses to put a dinner-only meal at lunch", () => {
    expect(canMove(week(), MON_DINNER, WED_LUNCH, catalogue.get)).toBe(false);
    expect(moveMeal(week(), MON_DINNER, WED_LUNCH, diners, catalogue.get)).toEqual(week());
  });
});

describe("other edits", () => {
  it("toggles the lock of a cooked meal", () => {
    expect(toggleLock(week(), MON_DINNER)[MON_DINNER]).toMatchObject({ locked: true });
  });

  it("clears a slot and the leftovers it fed", () => {
    const plan = clearSlot(week(), MON_DINNER, diners, catalogue.get);
    expect(plan[MON_DINNER]).toEqual(FREE);
    expect(plan[TUE_LUNCH]).toEqual(FREE);
  });
});
