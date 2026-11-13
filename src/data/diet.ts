import type { Meal } from "./types";

export interface Diet {
  vegetarian: boolean;
  noPork: boolean;
  noFish: boolean;
}

export const NO_DIET: Diet = { vegetarian: false, noPork: false, noFish: false };

// Matched against ingredient names, so the household's own dishes are classified too.
const PORK = /lard|jambon|saucisse|porc|bacon|chorizo|poitrine|petit salé|charcuterie/i;
const FISH =
  /poisson|cabillaud|saumon|\bthon\b|moule|saint-jacques|maquereau|colin|crevette|sardine|truite|merlu|anchois/i;
const OTHER_MEAT = /poulet|b(œ|oe)uf|veau|agneau|dinde|canard|steak|viande|lapin|merguez|bavette|entrec(ô|o)te|onglet|rumsteck/i;

const has = (meal: Meal, pattern: RegExp) => meal.ingredients.some(([name]) => pattern.test(name));

export const hasPork = (meal: Meal) => has(meal, PORK);
export const hasFish = (meal: Meal) => has(meal, FISH);
export const isVegetarian = (meal: Meal) => !hasPork(meal) && !hasFish(meal) && !has(meal, OTHER_MEAT);

export function fitsDiet(meal: Meal, diet: Diet): boolean {
  if (diet.vegetarian && !isVegetarian(meal)) return false;
  if (diet.noPork && hasPork(meal)) return false;
  if (diet.noFish && hasFish(meal)) return false;
  return true;
}
