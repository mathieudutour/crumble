import { describe, expect, it } from "vitest";
import { RECIPES } from "../data/recipes";
import { stepParts, stepText } from "./steps";

describe("stepText", () => {
  it("reads unscaled at factor 1, without the braces", () => {
    expect(stepText("Bats les {3 œufs} avec {20 cl} de crème et {1 L} d’eau.", 1)).toBe(
      "Bats les 3 œufs avec 20 cl de crème et 1 L d’eau.",
    );
  });

  it("scales quantities and agrees the words with them", () => {
    expect(stepText("Bats les {3 œufs}, ajoute {1 gousse} d’ail et {1 jaune} d’œuf.", 2)).toBe(
      "Bats les 6 œufs, ajoute 2 gousses d’ail et 2 jaunes d’œuf.",
    );
    expect(stepText("Mélange {2 œufs}.", 0.5)).toBe("Mélange 1 œuf.");
  });

  it("scales metric units and spoons, and rounds them", () => {
    expect(stepText("{40 g} de beurre, {50 cl} de lait, {1,2 L} d’eau, {2 c. à s.} d’huile, {5} d’huile", 1.5)).toBe(
      "60 g de beurre, 75 cl de lait, 1,8 L d’eau, 3 c. à s. d’huile, 8 d’huile",
    );
  });

  it("leaves numbers outside braces alone", () => {
    expect(stepText("Préchauffe à 200 °C, 1 c. à s. de crème par ramequin.", 2)).toBe(
      "Préchauffe à 200 °C, 1 c. à s. de crème par ramequin.",
    );
  });

  it("keeps durations as timers next to scaled quantities", () => {
    expect(stepParts("Fais fondre {40 g} de beurre 5 min.", 2)).toEqual([
      "Fais fondre ",
      { kind: "quantity", text: "80 g" },
      " de beurre ",
      { kind: "timer", label: "5 min", seconds: 300 },
      ".",
    ]);
  });
});

describe("recipe quantities", () => {
  it("are all well-formed", () => {
    for (const [id, steps] of Object.entries(RECIPES)) {
      for (const step of steps) expect(stepText(step, 1.5), id).not.toMatch(/[{}]/);
    }
  });
});
