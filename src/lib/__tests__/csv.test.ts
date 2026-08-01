import { describe, it, expect } from "vitest";
import { parseCSV, parseCSVRow } from "../csv";

describe("parseCSV", () => {
  it("parses a simple header + data file", () => {
    const rows = parseCSV("title,priority,due_date\nTask A,high,2026-07-28\nTask B,low,2026-07-29");
    expect(rows).toEqual([
      ["title", "priority", "due_date"],
      ["Task A", "high", "2026-07-28"],
      ["Task B", "low", "2026-07-29"],
    ]);
  });

  it("handles quoted fields containing commas and newlines", () => {
    const rows = parseCSV('title,description\n"Task, one","line1\nline2"');
    expect(rows).toEqual([["title", "description"], ["Task, one", "line1\nline2"]]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    const rows = parseCSV('title\n"He said ""hi"""');
    expect(rows).toEqual([["title"], ['He said "hi"']]);
  });

  it("handles CRLF line endings", () => {
    const rows = parseCSV("title,status\r\nTask A, done\r\n");
    expect(rows).toEqual([
      ["title", "status"],
      ["Task A", " done"],
    ]);
  });

  it("strips a UTF-8 BOM from the first header", () => {
    const rows = parseCSV("\uFEFFtitle,priority\nTask A,high");
    expect(rows[0][0]).toBe("title");
  });

  it("skips blank lines", () => {
    const rows = parseCSV("title\n\nTask A\n\nTask B\n");
    expect(rows.length).toBe(3);
  });
});

describe("parseCSVRow", () => {
  it("splits unquoted fields on commas", () => {
    expect(parseCSVRow("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("keeps commas inside quotes", () => {
    expect(parseCSVRow('"a,b",c')).toEqual(["a,b", "c"]);
  });
});
