export interface MealTime {
  /** Minutes from starting to eating, excluding chilling that can happen ahead. */
  total: number;
  /** Minutes of hands-on work. */
  active: number;
}

/** First duration in `text`: "1 h 15" → 75, "50 min" → 50. */
function minutesIn(text: string): number | undefined {
  const hours = text.match(/(\d+)\s*h(?:\s*(\d+))?/);
  if (hours) return Number(hours[1]) * 60 + Number(hours[2] ?? 0);
  const minutes = text.match(/(\d+)\s*min/);
  return minutes ? Number(minutes[1]) : undefined;
}

const cache = new Map<string, MealTime>();

/** Parses a meal's time label: "1 h 15 (20 min actif)", "15 min + 2 h au frais". */
export function parseMealTime(label: string): MealTime {
  const cached = cache.get(label);
  if (cached) return cached;
  const [main = "", detail = ""] = label.split("(");
  const total = minutesIn(main.split("+")[0] ?? "") ?? 0;
  const time = { total, active: minutesIn(detail) ?? total };
  cache.set(label, time);
  return time;
}

/** 75 → "1 h 15", 60 → "1 h", 45 → "45 min". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

export const mealTimeLabel = (total: number, active?: number) =>
  active && active < total ? `${formatMinutes(total)} (${formatMinutes(active)} actif)` : formatMinutes(total);

/** A recipe step split around the durations it mentions, so each can start a timer. */
export type StepPart = string | { label: string; seconds: number };

// "1 h 15", "2 h", "35 à 40 min" (timed at the lower bound, the moment to start checking).
const DURATION = /(\d+)\s*h(?:\s*(\d+))?(?![\p{L}\d])|(\d+)(?:\s*à\s*\d+)?\s*min(?!\p{L})/gu;

export function splitTimers(step: string): StepPart[] {
  const parts: StepPart[] = [];
  let last = 0;
  for (const match of step.matchAll(DURATION)) {
    const [label, hours, hourMinutes, minutes] = match;
    const total = hours ? Number(hours) * 60 + Number(hourMinutes ?? 0) : Number(minutes);
    if (match.index > last) parts.push(step.slice(last, match.index));
    parts.push({ label, seconds: total * 60 });
    last = match.index + label.length;
  }
  if (last < step.length) parts.push(step.slice(last));
  return parts;
}
