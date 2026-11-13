import { describe, expect, it } from "vitest";
import { FIXED_MEALS, MEALS } from "./meals";
import { RECIPES } from "./recipes";
import { SEASONS } from "./seasons";

const ALL = [...MEALS, ...Object.values(FIXED_MEALS)];

describe("data", () => {
  it("gives every meal a recipe, and every recipe a meal", () => {
    expect(ALL.filter((m) => !RECIPES[m.id]?.length).map((m) => m.id)).toEqual([]);
    expect(Object.keys(RECIPES).filter((id) => !ALL.some((m) => m.id === id))).toEqual([]);
  });

  it("only lists seasons for known meals, with valid months", () => {
    for (const [id, months] of Object.entries(SEASONS)) {
      expect(
        MEALS.some((m) => m.id === id),
        id,
      ).toBe(true);
      expect(
        months.every((m) => Number.isInteger(m) && m >= 1 && m <= 12),
        id,
      ).toBe(true);
    }
  });

  it("marks every quiche as a lunch", () => {
    expect(MEALS.filter((m) => m.quiche && m.type !== "lunch")).toEqual([]);
  });
});
