import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export const DEFAULT_TIMEZONE = "America/Barbados";

export function dateInTimezone(tz: string, d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().split("T")[0];
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function getInitials(email: string) {
  const name = email.split("@")[0];
  return name.slice(0, 2).toUpperCase();
}

export function generateSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type Recurrence = "daily" | "weekly" | "biweekly" | "monthly" | "yearly";

interface RecurrenceBase {
  id: string;
  recurrence?: string | null;
  recurrence_end?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

function addIntervalInTz(d: Date, rec: Recurrence, tz: string): Date {
  const localParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(localParts.find((p) => p.type === t)?.value);
  const y = get("year");
  const m = get("month");
  const day = get("day");
  let ny = y;
  let nm = m;
  let nd = day;
  if (rec === "daily") nd += 1;
  else if (rec === "weekly") nd += 7;
  else if (rec === "biweekly") nd += 14;
  else if (rec === "monthly") nm += 1;
  else if (rec === "yearly") ny += 1;
  let nextDate: Date;
  try {
    nextDate = new Date(Date.UTC(ny, nm - 1, nd));
  } catch {
    return d;
  }
  const tzDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(nextDate);
  if (tzDay !== `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`) {
    if (rec === "monthly") {
      nextDate = new Date(Date.UTC(ny, nm, 0));
    } else {
      return d;
    }
  }
  const offsetString = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "longOffset",
  }).formatToParts(nextDate).find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m2 = offsetString.match(/GMT([+-]\d{1,2}):?(\d{2})?/);
  const offH = m2 ? Number(m2[1]) * 60 : 0;
  const offM = m2 && m2[2] ? Number(m2[2]) : 0;
  const totalOffsetMin = offH + (offH < 0 ? -offM : offM);
  return new Date(nextDate.getTime() - totalOffsetMin * 60_000);
}

export function expandRecurrence<T extends RecurrenceBase>(
  evt: T,
  rangeStart: Date,
  rangeEnd: Date,
  idPrefix = "r",
  timezone?: string,
): (T & { id: string })[] {
  if (!evt.recurrence || evt.recurrence === "none" || !evt.start_date) return [];
  const results: (T & { id: string })[] = [];
  const originalStart = new Date(evt.start_date);
  const originalEnd = evt.end_date ? new Date(evt.end_date) : null;
  const duration = originalEnd ? originalEnd.getTime() - originalStart.getTime() : 0;
  const recEnd = evt.recurrence_end ? new Date(evt.recurrence_end) : new Date(rangeEnd.getTime() + 365 * 86400000);
  let current = new Date(originalStart);
  let safety = 0;
  const maxIterations = 500;
  while (current <= rangeEnd && current <= recEnd && safety < maxIterations) {
    if (current >= rangeStart) {
      const evtEnd = duration > 0 ? new Date(current.getTime() + duration) : null;
      results.push({
        ...evt,
        id: `${evt.id}-${idPrefix}-${current.getTime()}`,
        start_date: current.toISOString(),
        end_date: evtEnd ? evtEnd.toISOString() : current.toISOString(),
      });
    }
    safety++;
    const next = timezone
      ? addIntervalInTz(current, evt.recurrence as Recurrence, timezone)
      : (() => {
          const fallback = new Date(current);
          const rec = evt.recurrence as Recurrence;
          if (rec === "daily") fallback.setDate(fallback.getDate() + 1);
          else if (rec === "weekly") fallback.setDate(fallback.getDate() + 7);
          else if (rec === "biweekly") fallback.setDate(fallback.getDate() + 14);
          else if (rec === "monthly") fallback.setMonth(fallback.getMonth() + 1);
          else if (rec === "yearly") fallback.setFullYear(fallback.getFullYear() + 1);
          return fallback;
        })();
    if (next > rangeEnd || next > recEnd) break;
    current = next;
  }
  return results;
}
