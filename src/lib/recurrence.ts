export interface LocalDateTime {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
  s: number;
}

export function getLocalParts(d: Date, tz: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    h: get("hour") === 24 ? 0 : get("hour"),
    min: get("minute"),
    s: get("second"),
  };
}

export function getTimezoneOffsetMs(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "longOffset",
  }).formatToParts(d);
  const offsetString = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m = offsetString.match(/GMT([+-]\d{1,2}):?(\d{2})?/);
  if (!m) return 0;
  const hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  const totalMin = hours * 60 + (hours < 0 ? -minutes : minutes);
  return totalMin * 60_000;
}

export function tzLocalToUtc(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  s: number,
  tz: string,
): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, h, min, s));
  const offset = getTimezoneOffsetMs(guess, tz);
  return new Date(guess.getTime() - offset);
}

export function nextOccurrence(current: Date, recurrence: string, tz: string): Date | null {
  const local = getLocalParts(current, tz);
  if (recurrence === "daily") {
    return tzLocalToUtc(local.y, local.m, local.d + 1, local.h, local.min, local.s, tz);
  }
  if (recurrence === "weekly") {
    return tzLocalToUtc(local.y, local.m, local.d + 7, local.h, local.min, local.s, tz);
  }
  if (recurrence === "biweekly") {
    return tzLocalToUtc(local.y, local.m, local.d + 14, local.h, local.min, local.s, tz);
  }
  if (recurrence === "monthly") {
    const target = tzLocalToUtc(local.y, local.m + 1, local.d, local.h, local.min, local.s, tz);
    const verify = getLocalParts(target, tz);
    if (verify.d !== local.d) {
      const lastDay = new Date(Date.UTC(local.y, local.m + 1, 0)).getUTCDate();
      return tzLocalToUtc(local.y, local.m + 1, lastDay, local.h, local.min, local.s, tz);
    }
    return target;
  }
  if (recurrence === "yearly") {
    const target = tzLocalToUtc(local.y + 1, local.m, local.d, local.h, local.min, local.s, tz);
    const verify = getLocalParts(target, tz);
    if (verify.m !== local.m) {
      return tzLocalToUtc(local.y + 1, 2, 28, local.h, local.min, local.s, tz);
    }
    return target;
  }
  return null;
}

export function utcIsoToLocalDateStr(isoStr: string, tz: string): string {
  const d = new Date(isoStr);
  const p = getLocalParts(d, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
