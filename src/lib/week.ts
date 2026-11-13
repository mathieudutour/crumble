// Dates are local "YYYY-MM-DD" strings, so time zones and DST never shift a day.

const pad = (n: number) => String(n).padStart(2, "0");

export const toIso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function fromIso(iso: string): Date {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const date = fromIso(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

export const daysBetween = (from: string, to: string) =>
  Math.round((fromIso(to).getTime() - fromIso(from).getTime()) / 86_400_000);

/** 0 for Monday … 6 for Sunday. */
const weekday = (date: Date) => (date.getDay() + 6) % 7;

export function mondayOf(date: Date): string {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - weekday(date));
  return toIso(monday);
}

export const todayIso = (now = new Date()) => toIso(now);

/** Monday to Wednesday plans the current week; from Thursday on, the next one. */
export function defaultWeek(now = new Date()): string {
  const monday = mondayOf(now);
  return weekday(now) >= 3 ? addDays(monday, 7) : monday;
}

/** The month a week belongs to for seasonality: the month of its Thursday. */
export const seasonMonthOf = (week: string) => fromIso(addDays(week, 3)).getMonth() + 1;

export const MONTHS_SHORT = [
  "janv.",
  "févr.",
  "mars",
  "avril",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

const dayMonth = (date: Date) => `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;

/** "du 16 au 22 nov.", "du 30 nov. au 6 déc." */
export function weekRange(week: string): string {
  const start = fromIso(week);
  const end = fromIso(addDays(week, 6));
  const from = start.getMonth() === end.getMonth() ? String(start.getDate()) : dayMonth(start);
  return `du ${from} au ${dayMonth(end)}`;
}

/** Relative name of a week: "Cette semaine", "Semaine prochaine", "Il y a 2 semaines". */
export function weekName(week: string, now = new Date()): string {
  const weeks = Math.round(daysBetween(mondayOf(now), week) / 7);
  if (weeks === 0) return "Cette semaine";
  if (weeks === 1) return "Semaine prochaine";
  if (weeks === -1) return "Semaine dernière";
  return weeks < 0 ? `Il y a ${-weeks} semaines` : `Dans ${weeks} semaines`;
}
