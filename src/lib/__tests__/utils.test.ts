import { describe, it, expect } from "vitest";
import { cn, formatDate, formatRelativeTime, generateSlug, getInitials, expandRecurrence, dateInTimezone, addDaysToDate } from "../utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });
});

describe("formatDate", () => {
  it("formats a date string", () => {
    const result = formatDate("2026-07-28T12:00:00");
    expect(result).toContain("Jul");
    expect(result).toContain("28");
    expect(result).toContain("2026");
  });

  it("formats a Date object", () => {
    const result = formatDate(new Date(2026, 0, 1, 12, 0));
    expect(result).toContain("Jan");
    expect(result).toContain("1");
  });
});

describe("formatRelativeTime", () => {
  it('returns "just now" for less than a minute', () => {
    expect(formatRelativeTime(new Date())).toBe("just now");
  });

  it("returns minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(fiveMinAgo)).toBe("5m ago");
  });

  it("returns hours ago", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000);
    expect(formatRelativeTime(threeHoursAgo)).toBe("3h ago");
  });

  it("returns days ago", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000);
    expect(formatRelativeTime(twoDaysAgo)).toBe("2d ago");
  });

  it("returns formatted date for older dates", () => {
    const oldDate = new Date("2025-01-15T12:00:00");
    const result = formatRelativeTime(oldDate);
    expect(result).toContain("Jan");
    expect(result).toContain("15");
  });
});

describe("getInitials", () => {
  it("returns first two chars of email local part", () => {
    expect(getInitials("john@example.com")).toBe("JO");
  });

  it("handles short names", () => {
    expect(getInitials("a@b.com")).toBe("A");
  });
});

describe("generateSlug", () => {
  it("lowercases and replaces spaces", () => {
    expect(generateSlug("My Team")).toBe("my-team");
  });

  it("removes special characters", () => {
    expect(generateSlug("Hello! World?")).toBe("hello-world");
  });

  it("trims leading/trailing hyphens", () => {
    expect(generateSlug("--hello--")).toBe("hello");
  });

  it("handles multiple spaces", () => {
    expect(generateSlug("a  b   c")).toBe("a-b-c");
  });
});

describe("expandRecurrence", () => {
  const baseEvent = {
    id: "evt-1",
    title: "Daily standup",
    start_date: "2026-07-28T13:00:00Z",
    end_date: "2026-07-28T13:30:00Z",
    recurrence: "daily" as const,
    recurrence_end: null,
  };

  it("expands a daily event within the range", () => {
    const start = new Date("2026-07-28T00:00:00Z");
    const end = new Date("2026-07-31T00:00:00Z");
    const out = expandRecurrence(baseEvent, start, end, "r");
    expect(out.length).toBe(3);
    expect(out[0].start_date).toBe("2026-07-28T13:00:00.000Z");
    expect(out[1].start_date).toBe("2026-07-29T13:00:00.000Z");
    expect(out[2].start_date).toBe("2026-07-30T13:00:00.000Z");
  });

  it("respects recurrence_end", () => {
    const evt = { ...baseEvent, recurrence_end: "2026-07-30" };
    const start = new Date("2026-07-28T00:00:00Z");
    const end = new Date("2026-08-15T00:00:00Z");
    const out = expandRecurrence(evt, start, end, "r");
    expect(out.length).toBe(2);
  });

  it("returns empty when recurrence is null or none", () => {
    expect(expandRecurrence({ ...baseEvent, recurrence: null }, new Date(), new Date()).length).toBe(0);
    expect(expandRecurrence({ ...baseEvent, recurrence: "none" }, new Date(), new Date()).length).toBe(0);
  });

  it("preserves the original duration for each occurrence", () => {
    const start = new Date("2026-07-28T00:00:00Z");
    const end = new Date("2026-07-30T00:00:00Z");
    const out = expandRecurrence(baseEvent, start, end, "r");
    for (const o of out) {
      const d1 = new Date(o.start_date).getTime();
      const d2 = new Date(o.end_date).getTime();
      expect(d2 - d1).toBe(30 * 60 * 1000);
    }
  });

  it("produces occurrences on the correct local-day boundary in the given timezone", () => {
    const evt = {
      id: "weekly-1",
      title: "Weekly review",
      start_date: "2026-07-31T23:00:00Z",
      end_date: "2026-07-31T23:30:00Z",
      recurrence: "weekly" as const,
      recurrence_end: null,
    };
    const start = new Date("2026-07-28T00:00:00Z");
    const end = new Date("2026-08-30T00:00:00Z");
    const outUtc = expandRecurrence(evt, start, end, "r");
    const outNy = expandRecurrence(evt, start, end, "r", "America/New_York");
    expect(outUtc.length).toBeGreaterThan(0);
    expect(outNy.length).toBeGreaterThan(0);
  });
});

describe("dateInTimezone", () => {
  it("returns the local calendar day for a timezone ahead of UTC", () => {
    const d = new Date("2026-07-28T22:30:00Z");
    expect(dateInTimezone("Asia/Kolkata", d)).toBe("2026-07-29");
  });

  it("returns the local calendar day for a timezone behind UTC", () => {
    const d = new Date("2026-07-28T02:30:00Z");
    expect(dateInTimezone("America/Barbados", d)).toBe("2026-07-27");
  });
});

describe("addDaysToDate", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDaysToDate("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysToDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles negative days", () => {
    expect(addDaysToDate("2026-03-01", -1)).toBe("2026-02-28");
  });
});
