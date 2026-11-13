import type { Meal } from "../data/types";
import { recipeSteps } from "./catalogue";

/**
 * Seasonings recipes use without listing them as ingredients (they're expected in the cupboard), found by their
 * mention in the steps. Patterns are matched against normalised text (see `normalize`).
 */
const SEASONINGS: Record<string, RegExp> = {
  Ail: /\bail\b/,
  Moutarde: /moutarde/,
  Miel: /\bmiel\b/,
  Vinaigre: /vinaigre/,
  Muscade: /muscade/,
  Cannelle: /cannelle/,
  Cumin: /cumin/,
  Curry: /\bcurry\b/,
  Gingembre: /gingembre/,
  Curcuma: /curcuma/,
  Paprika: /paprika/,
  Piment: /piment/,
  "Clou de girofle": /girofle/,
  Laurier: /laurier/,
  Thym: /\bthym\b/,
  Origan: /origan/,
  Sucre: /sucre|cassonade/,
  "Concentré de tomate": /concentre de tomate/,
};

/** "Œufs" and "oeuf", "Pommes de terre" and "pomme de terre" compare equal. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length > 3 ? word.replace(/[sx]$/, "") : word))
    .join(" ");
}

/** The avoided ingredients `meal` contains, by the names the household chose. */
export function avoidedIn(meal: Meal, avoided: readonly string[]): string[] {
  if (!avoided.length) return [];
  const names = new Set(meal.ingredients.map(([name]) => normalize(name)));
  let text: string | undefined;
  return avoided.filter((name) => {
    if (names.has(normalize(name))) return true;
    const pattern = SEASONINGS[name];
    if (!pattern) return false;
    text ??= normalize([meal.name, ...recipeSteps(meal)].join(" "));
    return pattern.test(text);
  });
}

/** Every word of the query starts a word of `name`: "oeu" finds "Œufs" but not "Bœuf". */
export function matchesSearch(name: string, query: string): boolean {
  const words = normalize(name).split(/[\s-]+/);
  return normalize(query)
    .split(/[\s-]+/)
    .every((q) => words.some((w) => w.startsWith(q)));
}

export interface AvoidOption {
  name: string;
  /** Meals containing it. */
  count: number;
}

/** Everything that can be avoided: every ingredient of the catalogue, plus cupboard seasonings. */
export function avoidOptions(meals: readonly Meal[]): AvoidOption[] {
  const names = new Map<string, string>();
  for (const meal of meals)
    for (const [name] of meal.ingredients) if (!names.has(normalize(name))) names.set(normalize(name), name);
  for (const name of Object.keys(SEASONINGS)) if (!names.has(normalize(name))) names.set(normalize(name), name);
  return [...names.values()]
    .map((name) => ({ name, count: meals.filter((meal) => avoidedIn(meal, [name]).length).length }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
