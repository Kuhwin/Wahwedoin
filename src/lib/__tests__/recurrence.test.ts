import { describe, it, expect } from "vitest";
import { getLocalParts, tzLocalToUtc, nextOccurrence, utcIsoToLocalDateStr, getTimezoneOffsetMs } from "../recurrence";

describe("getLocalParts", () => {
  it("returns the local date parts in the given timezone", () => {
    const utc = new Date("2026-07-28T13:00:00Z");
    const ny = getLocalParts(utc, "America/New_York");
    expect(ny.y).toBe(2026);
    expect(ny.m).toBe(7);
    expect(ny.d).toBe(28);
    expect(ny.h).toBe(9);
  });

  it("rolls the date forward in timezones ahead of UTC", () => {
    const utc = new Date("2026-07-28T22:00:00Z");
    const tokyo = getLocalParts(utc, "Asia/Tokyo");
    expect(tokyo.d).toBe(29);
  });
});

describe("tzLocalToUtc", () => {
  it("roundtrips with getLocalParts", () => {
    const original = new Date("2026-07-28T13:00:00Z");
    const parts = getLocalParts(original, "America/New_York");
    const reconstructed = tzLocalToUtc(parts.y, parts.m, parts.d, parts.h, parts.min, parts.s, "America/New_York");
    expect(reconstructed.toISOString()).toBe(original.toISOString());
  });
});

describe("getTimezoneOffsetMs", () => {
  it("returns 0 for UTC", () => {
    expect(getTimezoneOffsetMs(new Date(), "UTC")).toBe(0);
  });

  it("returns a positive offset for positive-offset zones (e.g. Tokyo)", () => {
    const offset = getTimezoneOffsetMs(new Date(), "Asia/Tokyo");
    expect(offset).toBe(9 * 60 * 60_000);
  });

  it("returns a negative offset for negative-offset zones (e.g. New York in summer)", () => {
    const offset = getTimezoneOffsetMs(new Date("2026-07-28T12:00:00Z"), "America/New_York");
    expect(offset).toBe(-4 * 60 * 60_000);
  });
});

describe("nextOccurrence", () => {
  it("advances by one day in the local timezone", () => {
    const start = new Date("2026-07-28T13:00:00Z");
    const next = nextOccurrence(start, "daily", "America/New_York");
    expect(next).not.toBeNull();
    const parts = getLocalParts(next!, "America/New_York");
    expect(parts.d).toBe(29);
    expect(parts.h).toBe(9);
  });

  it("clamps monthly recurrence to the last day when the target month is shorter", () => {
    const start = new Date("2026-01-31T13:00:00Z");
    const next = nextOccurrence(start, "monthly", "UTC");
    const parts = getLocalParts(next!, "UTC");
    expect(parts.m).toBe(2);
    expect(parts.d).toBe(28);
  });

  it("clamps yearly recurrence on Feb 29 to Feb 28 in non-leap years", () => {
    const start = new Date("2024-02-29T13:00:00Z");
    const next = nextOccurrence(start, "yearly", "UTC");
    const parts = getLocalParts(next!, "UTC");
    expect(parts.y).toBe(2025);
    expect(parts.m).toBe(2);
    expect(parts.d).toBe(28);
  });

  it("advances weekly by 7 days", () => {
    const start = new Date("2026-07-28T13:00:00Z");
    const next = nextOccurrence(start, "weekly", "UTC");
    const parts = getLocalParts(next!, "UTC");
    expect(parts.d).toBe(4);
    expect(parts.m).toBe(8);
  });

  it("returns null for an unknown recurrence", () => {
    expect(nextOccurrence(new Date(), "fortnightly", "UTC")).toBeNull();
  });
});

describe("utcIsoToLocalDateStr", () => {
  it("converts an ISO timestamp to a YYYY-MM-DD in the given timezone", () => {
    const utc = new Date("2026-07-28T22:00:00Z");
    const iso = utc.toISOString();
    expect(utcIsoToLocalDateStr(iso, "Asia/Tokyo")).toBe("2026-07-29");
    expect(utcIsoToLocalDateStr(iso, "America/Los_Angeles")).toBe("2026-07-28");
  });

  it("returns the UTC date for UTC timezone", () => {
    const iso = "2026-07-28T22:00:00.000Z";
    expect(utcIsoToLocalDateStr(iso, "UTC")).toBe("2026-07-28");
  });
});
