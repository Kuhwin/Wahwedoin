import { describe, it, expect } from "vitest";
import { classifyWorkloadTask, buildWorkloadRows } from "@/lib/workload";

describe("classifyWorkloadTask", () => {
  it("marks done tasks as not open", () => {
    expect(classifyWorkloadTask({ user_id: "u1", status: "done", due_date: "2024-01-01" }, "2024-02-01"))
      .toEqual({ open: false, in_progress: false, overdue: false });
  });

  it("flags in-progress tasks without an overdue status", () => {
    expect(classifyWorkloadTask({ user_id: "u1", status: "in_progress", due_date: "2024-03-01" }, "2024-02-01"))
      .toEqual({ open: true, in_progress: true, overdue: false });
  });

  it("flags past-due tasks as overdue", () => {
    expect(classifyWorkloadTask({ user_id: "u1", status: "todo", due_date: "2024-01-15" }, "2024-02-01"))
      .toEqual({ open: true, in_progress: false, overdue: true });
  });

  it("treats a due date on today as not overdue", () => {
    expect(classifyWorkloadTask({ user_id: "u1", status: "todo", due_date: "2024-02-01" }, "2024-02-01"))
      .toEqual({ open: true, in_progress: false, overdue: false });
  });

  it("treats missing due date as not overdue", () => {
    expect(classifyWorkloadTask({ user_id: "u1", status: "todo", due_date: null }, "2024-02-01"))
      .toEqual({ open: true, in_progress: false, overdue: false });
  });
});

describe("buildWorkloadRows", () => {
  const tz = new Map([["u1", "America/New_York"]]);

  it("aggregates open, in-progress, and overdue counts per user", () => {
    const rows = buildWorkloadRows(
      [
        { user_id: "u1", status: "todo", due_date: "2024-01-01" },
        { user_id: "u1", status: "in_progress", due_date: null },
        { user_id: "u1", status: "in_progress", due_date: "2024-03-01" },
        { user_id: "u1", status: "done", due_date: "2024-01-01" },
      ],
      tz,
      new Date("2024-02-01T12:00:00Z"),
    );
    expect(rows).toEqual([{ user_id: "u1", open: 3, in_progress: 2, overdue: 1 }]);
  });

  it("returns a row even when a user has only done tasks", () => {
    const rows = buildWorkloadRows(
      [{ user_id: "u1", status: "done", due_date: null }],
      tz,
      new Date("2024-02-01T12:00:00Z"),
    );
    expect(rows).toEqual([{ user_id: "u1", open: 0, in_progress: 0, overdue: 0 }]);
  });
});
