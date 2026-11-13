import type { Meal } from "../data/types";
import { MONTHS_SHORT } from "./week";

const MONTHS_LONG = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];
const MONTH_EMOJIS = ["❄️", "❄️", "🌱", "🌱", "🌱", "☀️", "☀️", "☀️", "🍂", "🍂", "🍂", "❄️"];

export const monthTitle = (month: number) => `${MONTHS_LONG[month - 1]} ${MONTH_EMOJIS[month - 1]}`;

export const isInSeason = (meal: Meal, month: number) => meal.type === "fixed" || meal.months.includes(month);

/** "oct. → mars". Seasons may wrap around the new year. */
export function seasonLabel(meal: Meal): string {
  const months = meal.months;
  if (months.length >= 12) return "Toute l’année";
  const start = months.find((m) => !months.includes(m === 1 ? 12 : m - 1));
  const end = months.find((m) => !months.includes(m === 12 ? 1 : m + 1));
  if (!start || !end) return "Toute l’année";
  return `${MONTHS_SHORT[start - 1]} → ${MONTHS_SHORT[end - 1]}`;
}
