import type { Meal } from "../data/types";
import type { Diners } from "./planning";

/** French decimal comma. */
export const decimal = (n: number) => String(n).replace(".", ",");

/** 1.5 → "1½". Falls back to the raw number when no fraction glyph fits. */
function fraction(x: number): string {
  const whole = Math.floor(x);
  const rest = x - whole;
  const glyph = rest >= 0.74 ? "¾" : rest >= 0.49 ? "½" : rest >= 0.24 ? "¼" : "";
  return (whole ? String(whole) : "") + glyph || String(x);
}

/** Units stored singular and pluralised for display. */
export const COUNT_UNITS = ["botte", "boîte", "tranche", "sachet", "paquet", "cube", "pot", "bocal"];

export function formatQuantity(quantity: number, unit: string): string {
  if (unit === "g" && quantity >= 1000) return `${decimal(+(quantity / 1000).toFixed(2))} kg`;
  if (unit === "cl" && quantity >= 100) return `${decimal(+(quantity / 100).toFixed(2))} L`;
  const amount = Number.isInteger(quantity) ? String(quantity) : fraction(quantity);
  const label = quantity > 1 && COUNT_UNITS.includes(unit) ? `${unit}s` : unit;
  return label ? `${amount} ${label}` : amount;
}

export function dinersText({ adults, kids }: Diners): string {
  if (!adults && !kids) return "Personne";
  const parts: string[] = [];
  if (adults) parts.push(`${adults} adulte${adults > 1 ? "s" : ""}`);
  if (kids) parts.push(`${kids} enfant${kids > 1 ? "s" : ""}`);
  return parts.join(" + ");
}

export function typeLabel(meal: Meal): string {
  switch (meal.type) {
    case "dinner":
      return "Dîner";
    case "lunch":
      return meal.quiche ? "Midi · quiche" : "Midi";
    default:
      return "Midi ou soir";
  }
}

export const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
