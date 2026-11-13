import { describe, expect, it } from "vitest";
import type { Meal } from "../data/types";
import { avoidedIn, avoidOptions, matchesSearch, normalize } from "./avoid";
import { makeCatalogue } from "./catalogue";

const catalogue = makeCatalogue();
const meal = (id: string) => catalogue.get(id)!;

describe("avoidedIn", () => {
  it("matches listed ingredients", () => {
    expect(avoidedIn(meal("omelette"), ["Œufs"])).toEqual(["Œufs"]);
    expect(avoidedIn(meal("risotto"), ["Œufs"])).toEqual([]);
  });

  it("finds cupboard seasonings in the steps", () => {
    expect(avoidedIn(meal("lentilles"), ["Moutarde"])).toEqual(["Moutarde"]); // in the vinaigrette
    expect(avoidedIn(meal("poulet"), ["Ail", "Miel"])).toEqual(["Ail", "Miel"]);
    expect(avoidedIn(meal("croque"), ["Ail"])).toEqual([]);
  });

  it("does not confuse ingredients that share a word", () => {
    expect(avoidedIn(meal("stjacques"), ["Cerneaux de noix"])).toEqual([]);
    expect(avoidedIn(meal("saladeendives"), ["Cerneaux de noix"])).toEqual(["Cerneaux de noix"]);
  });

  it("matches the household's own dishes however they spelled the ingredient", () => {
    const custom: Meal = {
      id: "perso-1",
      emoji: "🍳",
      name: "Œufs brouillés",
      type: "lunch",
      time: "10 min",
      months: [],
      ingredients: [["oeuf", 4, ""]],
      steps: [],
    };
    expect(avoidedIn(custom, ["Œufs"])).toEqual(["Œufs"]);
  });
});

describe("matchesSearch", () => {
  it("matches from the start of words, ignoring accents and plurals", () => {
    expect(matchesSearch("Œufs", "oeu")).toBe(true);
    expect(matchesSearch("Bœuf haché", "oeu")).toBe(false);
    expect(matchesSearch("Noix de Saint-Jacques", "jacques")).toBe(true);
    expect(matchesSearch("Cerneaux de noix", "noix")).toBe(true);
  });
});

describe("avoidOptions", () => {
  it("lists ingredients and seasonings once, with how many meals use them", () => {
    const options = avoidOptions(catalogue.all);
    const names = options.map((o) => o.name);
    expect(new Set(names.map(normalize)).size).toBe(names.length);
    expect(options.find((o) => o.name === "Moutarde")!.count).toBeGreaterThan(3);
    expect(options.find((o) => o.name === "Œufs")!.count).toBeGreaterThan(10);
  });
});
