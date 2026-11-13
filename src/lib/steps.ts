import { formatQuantity } from "./format";
import { scaleQuantity } from "./planning";
import { splitTimers } from "./time";

/**
 * Recipe steps mark the quantities that follow the portions with braces: "Bats les {3 œufs}", "{40 g} de beurre",
 * "{1 L} d’eau", "{2 c. à s.} d’huile". Anything outside braces is left as written, so temperatures, durations and
 * per-person amounts ("un œuf par bol") never scale.
 */
const QUANTITY = /\{(\d+(?:,\d+)?)(?:\s+([^}]+))?\}/g;

export type StepPart = string | { kind: "timer"; label: string; seconds: number } | { kind: "quantity"; text: string };

/** Metric units, converted to the units `scaleQuantity` rounds. */
const METRIC: Record<string, [unit: string, multiplier: number]> = {
  g: ["g", 1],
  kg: ["g", 1000],
  cl: ["cl", 1],
  L: ["cl", 100],
};

/** Agrees the counted word with the new amount: "1 gousse" → "2 gousses", "3 œufs" → "1 œuf". Abbreviations stay. */
function agree(word: string, amount: number): string {
  if (word.includes(".")) return word;
  if (amount > 1) return /[sxz]$/.test(word) ? word : `${word}s`;
  return /[^s]s$/.test(word) ? word.slice(0, -1) : word;
}

export function scaleStepQuantity(amountText: string, rest: string | undefined, factor: number): string {
  const amount = Number(amountText.replace(",", "."));
  const [first = "", ...others] = (rest ?? "").split(" ");
  const metric = METRIC[first];
  if (metric) {
    const [unit, multiplier] = metric;
    return [formatQuantity(scaleQuantity(amount * multiplier, unit, factor), unit), ...others].join(" ");
  }
  const scaled = scaleQuantity(amount, "", factor);
  return [formatQuantity(scaled, ""), first && agree(first, scaled), ...others].filter(Boolean).join(" ");
}

/** A step split into text, scaled quantities and durations (for timers). */
export function stepParts(step: string, factor: number): StepPart[] {
  const parts: StepPart[] = [];
  const pushText = (text: string) => {
    for (const part of splitTimers(text)) parts.push(typeof part === "string" ? part : { kind: "timer", ...part });
  };
  let last = 0;
  for (const match of step.matchAll(QUANTITY)) {
    if (match.index > last) pushText(step.slice(last, match.index));
    parts.push({ kind: "quantity", text: scaleStepQuantity(match[1]!, match[2], factor) });
    last = match.index + match[0].length;
  }
  if (last < step.length) pushText(step.slice(last));
  return parts;
}

/** The step as plain text, quantities scaled. */
export const stepText = (step: string, factor: number) =>
  stepParts(step, factor)
    .map((part) => (typeof part === "string" ? part : part.kind === "quantity" ? part.text : part.label))
    .join("");
