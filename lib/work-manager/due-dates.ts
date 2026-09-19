const CENTRAL_TIME_ZONE = "America/Chicago";
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function centralToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function validDate(date: Date) {
  return date.getUTCFullYear() === date.getUTCFullYear() && !Number.isNaN(date.getTime()) ? iso(date) : null;
}

export type DueDateParse = { text: string; dueDate: string; reviewNeeded: boolean };

export function extractDueDate(input: string, now = new Date()): DueDateParse {
  const explicit = input.match(/\bdue:(\d{4}-\d{2}-\d{2})\b/i);
  if (explicit) {
    const date = new Date(`${explicit[1]}T00:00:00Z`);
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(explicit[1]) && !Number.isNaN(date.getTime()) && iso(date) === explicit[1] ? explicit[1] : "";
    return { text: input.replace(explicit[0], " ").replace(/\s+/g, " ").trim(), dueDate, reviewNeeded: !dueDate };
  }

  const today = centralToday(now);
  const weekday = input.match(/\b(?:by|on)\s+(next\s+)?(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i);
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[2].toLowerCase());
    let delta = (target - today.getUTCDay() + 7) % 7;
    if (weekday[1] || delta === 0) delta += 7;
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() + delta);
    return { text: input.replace(weekday[0], " ").replace(/\s+/g, " ").trim(), dueDate: iso(date), reviewNeeded: false };
  }

  const month = input.match(/\b(?:by|on)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s*(\d{4}))?\b/i);
  if (month) {
    const year = Number(month[3] || today.getUTCFullYear());
    const date = new Date(Date.UTC(year, MONTHS.indexOf(month[1].toLowerCase()), Number(month[2])));
    if (date.getUTCMonth() !== MONTHS.indexOf(month[1].toLowerCase()) || date.getUTCDate() !== Number(month[2])) {
      return { text: input, dueDate: "", reviewNeeded: true };
    }
    if (!month[3] && date < today) date.setUTCFullYear(year + 1);
    return { text: input.replace(month[0], " ").replace(/\s+/g, " ").trim(), dueDate: iso(date), reviewNeeded: false };
  }

  return { text: input, dueDate: "", reviewNeeded: false };
}
