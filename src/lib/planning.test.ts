import { describe, expect, it } from "vitest";
import { MEALS } from "../data/meals";
import { makeCatalogue } from "./catalogue";
import {
  DEFAULT_HABITS,
  defaultDiners,
  isTooLong,
  lockedSlots,
  makePlan,
  scaleFactor,
  scaleQuantity,
  slotIndex,
  type PlanInput,
  type PlanSlot,
  type Preferences,
} from "./planning";

const catalogue = makeCatalogue();
const meal = (id: string) => catalogue.get(id)!;
const meals = (...ids: string[]) => ids.map(meal);

/** Deterministic stand-in for Math.random. */
function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const NO_PREFERENCES: Preferences = { weeknightMinutes: null, recent: new Map(), ratings: {}, kidsLike: {} };

const plan = (input: Partial<PlanInput> & Pick<PlanInput, "candidates">) =>
  makePlan({
    diners: defaultDiners(),
    habits: DEFAULT_HABITS,
    preferences: NO_PREFERENCES,
    lookup: catalogue.get,
    random: seeded(),
    ...input,
  });

const WEEKNIGHT = [0, 1, 2, 3, 4].map((day) => slotIndex(day, true));

describe("makePlan", () => {
  const liked = meals("poulet", "cabillaud", "risotto", "moules", "croque", "qlorraine", "omelette", "saladeendives");

  it("books the household's habits", () => {
    const week = plan({ candidates: liked });
    expect(week[slotIndex(2, true)]).toMatchObject({ kind: "cook", mealId: "pesto", habit: true });
    expect(week[slotIndex(6, true)]).toMatchObject({ kind: "cook", mealId: "crepes", habit: true });
  });

  it("skips meals nobody eats at home, habits included", () => {
    const diners = defaultDiners();
    diners[slotIndex(2, true)] = { adults: 0, kids: 0 };
    const week = plan({ candidates: liked, diners });
    expect(week[slotIndex(2, true)]).toEqual({ kind: "none" });
  });

  it("only puts lunch dishes at lunch and dinner dishes at dinner", () => {
    const week = plan({ candidates: liked, random: seeded(7) });
    week.forEach((slot, i) => {
      if (slot.kind !== "cook" || slot.habit) return;
      expect(meal(slot.mealId).type).not.toBe(i % 2 ? "lunch" : "dinner");
    });
  });

  it("books leftovers of a batch dinner for the next day and cooks enough for them", () => {
    const week = plan({ candidates: meals("poulet", "omelette") });
    const monday = week[slotIndex(0, true)];
    expect(monday).toMatchObject({ kind: "cook", mealId: "poulet" });
    expect(week[slotIndex(1, false)]).toEqual({ kind: "leftovers", mealId: "poulet", from: slotIndex(0, true) });
    // Monday dinner (2 adults + 1 child) plus Tuesday lunch (2 adults).
    expect(monday).toMatchObject({ portions: 4.5 });
  });

  it("leaves slots free when there are not enough meals", () => {
    expect(plan({ candidates: [] }).filter((s) => s.kind === "free")).toHaveLength(12);
  });

  it("keeps long meals off weekday evenings when shorter ones are liked", () => {
    const candidates = meals("potaufeu", "blanquette", "cabillaud", "risotto", "moules", "croque", "pizza", "omelette");
    const preferences = { ...NO_PREFERENCES, weeknightMinutes: 45 };
    for (let seed = 1; seed < 20; seed++) {
      const week = plan({ candidates, preferences, random: seeded(seed) });
      for (const slot of WEEKNIGHT) {
        const entry = week[slot];
        if (entry?.kind === "cook")
          expect(isTooLong(meal(entry.mealId), slot, 45), `seed ${seed} slot ${slot}`).toBe(false);
      }
    }
  });

  it("keeps locked meals and their leftovers on a redraw", () => {
    const first = plan({ candidates: liked });
    const thursday = slotIndex(3, true);
    first[thursday] = { kind: "cook", mealId: "poulet", portions: 0, factor: 1, locked: true };
    first[thursday + 1] = { kind: "leftovers", mealId: "poulet", from: thursday };
    const redrawn = plan({ candidates: liked, keep: lockedSlots(first), random: seeded(99) });
    expect(redrawn[thursday]).toMatchObject({ mealId: "poulet", locked: true });
    expect(redrawn[thursday + 1]).toMatchObject({ kind: "leftovers", mealId: "poulet" });
  });

  it("pushes back meals eaten last week", () => {
    const candidates = meals("cabillaud", "risotto");
    const recent = new Map([["cabillaud", 5]]);
    const week = plan({ candidates, habits: [], preferences: { ...NO_PREFERENCES, recent } });
    expect(week[slotIndex(0, true)]).toMatchObject({ mealId: "risotto" });
  });

  it("does not serve a quiche right after a quiche while another lunch dish is still unused", () => {
    const candidates = meals("qlorraine", "qjambon", "qchampi", "omelette", "saladeendives", "cabillaud");
    const isQuiche = (e: PlanSlot | undefined) =>
      (e?.kind === "cook" || e?.kind === "leftovers") && !!meal(e.mealId).quiche;
    for (let seed = 1; seed < 20; seed++) {
      const week = plan({ candidates, random: seeded(seed) });
      for (let day = 1; day < 7; day++) {
        const slot = slotIndex(day, false);
        const entry = week[slot];
        if (entry?.kind !== "cook" || !isQuiche(entry) || !isQuiche(week[slot - 2])) continue;
        const cooked = new Set(week.slice(0, slot).flatMap((s) => (s.kind === "cook" ? [s.mealId] : [])));
        const unusedOthers = candidates.filter((m) => m.type !== "dinner" && !m.quiche && !cooked.has(m.id));
        expect(
          unusedOthers.map((m) => m.id),
          `seed ${seed} day ${day}`,
        ).toEqual([]);
      }
    }
  });
});

describe("scaling", () => {
  it("scales quiches by whole quiches", () => {
    expect(scaleFactor(meal("qlorraine"), 4)).toBe(1);
    expect(scaleFactor(meal("qlorraine"), 7)).toBe(2);
  });

  it("scales other meals by quarters, never below half", () => {
    expect(scaleFactor(meal("cabillaud"), 2.5)).toBe(1);
    expect(scaleFactor(meal("cabillaud"), 5)).toBe(2);
    expect(scaleFactor(meal("cabillaud"), 0.5)).toBe(0.5);
  });

  it("rounds scaled quantities to measurable amounts", () => {
    expect(scaleQuantity(600, "g", 1.25)).toBe(750);
    expect(scaleQuantity(80, "g", 1.25)).toBe(100);
    expect(scaleQuantity(20, "cl", 1.25)).toBe(25);
    expect(scaleQuantity(0.5, "", 1.5)).toBe(1);
    expect(scaleQuantity(3, "", 0.5)).toBe(2);
  });
});

describe("defaultDiners", () => {
  it("adds a child at dinner and all weekend", () => {
    const diners = defaultDiners();
    expect(diners[slotIndex(0, false)]).toEqual({ adults: 2, kids: 0 });
    expect(diners[slotIndex(0, true)]).toEqual({ adults: 2, kids: 1 });
    expect(diners[slotIndex(5, false)]).toEqual({ adults: 2, kids: 1 });
  });
});

describe("meal data", () => {
  it("has unique ids", () => {
    const ids = MEALS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has enough lunches and dinners in season every month", () => {
    for (let month = 1; month <= 12; month++) {
      const inSeason = MEALS.filter((m) => m.months.includes(month));
      expect(inSeason.filter((m) => m.type !== "lunch").length, `dinners in month ${month}`).toBeGreaterThanOrEqual(5);
      expect(inSeason.filter((m) => m.type !== "dinner").length, `lunches in month ${month}`).toBeGreaterThanOrEqual(3);
    }
  });
});
