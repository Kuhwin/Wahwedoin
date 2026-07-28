import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
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

export function expandRecurrence<T extends { recurrence?: string | null; recurrence_end?: string | null; start_date?: string | null; end_date?: string | null }>(
  evt: T,
  rangeStart: Date,
  rangeEnd: Date,
  idPrefix = "r"
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
    safety++;
    const next = new Date(current);
    if (evt.recurrence === "daily") next.setDate(next.getDate() + 1);
    else if (evt.recurrence === "weekly") next.setDate(next.getDate() + 7);
    else if (evt.recurrence === "biweekly") next.setDate(next.getDate() + 14);
    else if (evt.recurrence === "monthly") next.setMonth(next.getMonth() + 1);
    else if (evt.recurrence === "yearly") next.setFullYear(next.getFullYear() + 1);
    if (next > rangeEnd || next > recEnd) break;
    const evtEnd = duration > 0 ? new Date(next.getTime() + duration) : null;
    if (next >= rangeStart) {
      results.push({
        ...evt,
        id: `${(evt as any).id}-${idPrefix}-${next.getTime()}`,
        start_date: next.toISOString(),
        end_date: evtEnd ? evtEnd.toISOString() : next.toISOString(),
      } as T & { id: string });
    }
    current = next;
  }
  return results;
}
