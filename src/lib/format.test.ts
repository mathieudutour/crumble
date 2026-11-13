import { describe, expect, it } from "vitest";
import { isVegetarian, hasFish, hasPork, fitsDiet, NO_DIET } from "../data/diet";
import { makeCatalogue } from "./catalogue";
import { formatQuantity } from "./format";
import { seasonLabel } from "./season";
import { shoppingList, splitPantry } from "./shopping";
import { formatMinutes, parseMealTime, splitTimers } from "./time";
import { defaultWeek, seasonMonthOf, weekName, weekRange } from "./week";
import { defaultDiners, withPortions, type PlanSlot } from "./planning";

const catalogue = makeCatalogue();
const meal = (id: string) => catalogue.get(id)!;

describe("formatQuantity", () => {
  it.each([
    [1200, "g", "1,2 kg"],
    [150, "cl", "1,5 L"],
    [0.5, "", "½"],
    [1.5, "", "1½"],
    [2, "cube", "2 cubes"],
    [6, "tranche", "6 tranches"],
    [1, "botte", "1 botte"],
    [3, "", "3"],
  ])("formats %s %s as %s", (quantity, unit, expected) => {
    expect(formatQuantity(quantity, unit)).toBe(expected);
  });
});

describe("seasonLabel", () => {
  it("handles seasons that wrap around the new year", () => {
    expect(seasonLabel(meal("poulet"))).toBe("oct. → mars");
  });

  it("labels all-year meals", () => {
    expect(seasonLabel(meal("croque"))).toBe("Toute l’année");
  });
});

describe("parseMealTime", () => {
  it.each([
    ["1 h 15 (20 min actif)", 75, 20],
    ["50 min", 50, 50],
    ["3 h (20 min actif)", 180, 20],
    ["15 min + 2 h au frais", 15, 15],
    ["1 h 10", 70, 70],
  ])("parses %s", (label, total, active) => {
    expect(parseMealTime(label)).toEqual({ total, active });
  });

  it("formats minutes back", () => {
    expect([formatMinutes(45), formatMinutes(60), formatMinutes(75)]).toEqual(["45 min", "1 h", "1 h 15"]);
  });
});

describe("splitTimers", () => {
  it("finds the durations of a step", () => {
    expect(splitTimers("Cuis 35 à 40 min, puis laisse reposer 1 h 30 à feu doux.")).toEqual([
      "Cuis ",
      { label: "35 à 40 min", seconds: 2100 },
      ", puis laisse reposer ",
      { label: "1 h 30", seconds: 5400 },
      " à feu doux.",
    ]);
  });

  it("ignores numbers that are not durations", () => {
    expect(splitTimers("Préchauffe le four à 200 °C avec 1 huile.")).toEqual([
      "Préchauffe le four à 200 °C avec 1 huile.",
    ]);
  });
});

describe("diet", () => {
  it("classifies meals from their ingredients", () => {
    expect(hasPork(meal("tartiflette"))).toBe(true);
    expect(hasFish(meal("nicoise"))).toBe(true);
    expect(isVegetarian(meal("risotto"))).toBe(true);
    expect(isVegetarian(meal("poulet"))).toBe(false);
    expect(fitsDiet(meal("qlorraine"), { ...NO_DIET, noPork: true })).toBe(false);
    expect(fitsDiet(meal("curry"), { vegetarian: true, noPork: true, noFish: true })).toBe(true);
  });
});

describe("weeks", () => {
  it("plans this week until Wednesday, then next week", () => {
    expect(defaultWeek(new Date(2026, 10, 11))).toBe("2026-11-09"); // Wednesday
    expect(defaultWeek(new Date(2026, 10, 12))).toBe("2026-11-16"); // Thursday
  });

  it("names and spans weeks", () => {
    const now = new Date(2026, 10, 12);
    expect(weekName("2026-11-16", now)).toBe("Semaine prochaine");
    expect(weekName("2026-10-26", now)).toBe("Il y a 2 semaines");
    expect(weekRange("2026-11-16")).toBe("du 16 au 22 nov.");
    expect(weekRange("2026-11-30")).toBe("du 30 nov. au 6 déc.");
  });

  it("takes a week's season from its Thursday", () => {
    expect(seasonMonthOf("2026-11-30")).toBe(12);
  });
});

describe("shopping list", () => {
  it("adds up an ingredient across meals and leaves pantry items aside", () => {
    const slots: PlanSlot[] = Array.from({ length: 14 }, () => ({ kind: "free" }));
    slots[1] = { kind: "cook", mealId: "curry", portions: 0, factor: 1 };
    slots[3] = { kind: "cook", mealId: "tajine", portions: 0, factor: 1 };
    const plan = withPortions(slots, defaultDiners(), catalogue.get);
    const list = shoppingList(plan, catalogue.get);
    const chickpeas = list.flatMap((g) => g.items).filter((i) => i.name === "Pois chiches");
    expect(chickpeas).toHaveLength(1);
    const { toBuy, atHome } = splitPantry(list, { Oignons: true });
    expect(atHome.map((i) => i.name)).toEqual(["Oignons"]);
    expect(toBuy.flatMap((g) => g.items).some((i) => i.name === "Oignons")).toBe(false);
  });
});
