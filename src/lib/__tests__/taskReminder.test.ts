import { describe, it, expect } from "vitest";
import { buildTaskReminderNotifications, REMINDER_STALE_MS } from "../taskReminder";

const now = Date.parse("2026-08-02T12:00:00Z");

const task = {
  id: "t1",
  title: "Ship release",
  project_id: "p1",
  reminder_at: "2026-08-02T09:00:00Z",
  assignees: ["u1"],
};

describe("buildTaskReminderNotifications", () => {
  it("fires for a reminder that has come due", () => {
    const out = buildTaskReminderNotifications([task], now, new Set());
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      user_id: "u1",
      title: "Reminder: Ship release",
      body: "This task needs your attention.",
      type: "warning",
      link: "/projects/p1",
    });
  });

  it("does not fire for a reminder still in the future", () => {
    const future = { ...task, reminder_at: "2026-08-02T13:00:00Z" };
    expect(buildTaskReminderNotifications([future], now, new Set())).toEqual([]);
  });

  it("skips reminders older than the stale window", () => {
    const stale = { ...task, reminder_at: new Date(now - REMINDER_STALE_MS - 1000).toISOString() };
    expect(buildTaskReminderNotifications([stale], now, new Set())).toEqual([]);
  });

  it("notifies every assignee once", () => {
    const multi = { ...task, assignees: ["u1", "u2"] };
    const out = buildTaskReminderNotifications([multi], now, new Set());
    expect(out.map((n) => n.user_id).sort()).toEqual(["u1", "u2"]);
  });

  it("dedupes by user and title against existing notifications", () => {
    const existing = new Set(["u1:Reminder: Ship release"]);
    expect(buildTaskReminderNotifications([task], now, existing)).toEqual([]);
  });

  it("falls back to /my-tasks when there is no project", () => {
    const orphan = { ...task, project_id: null };
    const out = buildTaskReminderNotifications([orphan], now, new Set());
    expect(out[0].link).toBe("/my-tasks");
  });
});
