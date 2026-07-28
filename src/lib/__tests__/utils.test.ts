import { describe, it, expect } from "vitest";
import { cn, formatDate, formatRelativeTime, generateSlug, getInitials } from "../utils";

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
