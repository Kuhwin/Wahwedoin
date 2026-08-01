import { describe, it, expect } from "vitest";
import {
  buildDueDateNotifications,
  classifyDueDateTask,
  type DueDateTaskInput,
} from "../dueDateLogic";

const task: DueDateTaskInput = {
  id: "t1",
  title: "Ship it",
  due_date: "2026-07-28",
  assignee_id: "u1",
  project_id: "p1",
};

const provider = { today: "2026-07-28", tomorrow: "2026-07-29" };

describe("classifyDueDateTask", () => {
  it("classifies an overdue task", () => {
    const out = classifyDueDateTask({ ...task, due_date: "2026-07-27" }, provider);
    expect(out?.type).toBe("warning");
    expect(out?.title).toBe("Task overdue: Ship it");
    expect(out?.link).toBe("/projects/p1");
  });

  it("classifies a task due today", () => {
    const out = classifyDueDateTask(task, provider);
    expect(out?.title).toBe("Task due today: Ship it");
  });

  it("classifies a task due tomorrow", () => {
    const out = classifyDueDateTask({ ...task, due_date: "2026-07-29" }, provider);
    expect(out?.type).toBe("info");
    expect(out?.title).toBe("Task due tomorrow: Ship it");
  });

  it("returns null for later dates or missing due dates", () => {
    expect(classifyDueDateTask({ ...task, due_date: "2026-08-01" }, provider)).toBeNull();
    expect(classifyDueDateTask({ ...task, due_date: null }, provider)).toBeNull();
  });

  it("falls back to /my-tasks when there is no project", () => {
    const out = classifyDueDateTask({ ...task, project_id: null }, provider);
    expect(out?.link).toBe("/my-tasks");
  });
});

describe("buildDueDateNotifications", () => {
  it("skips tasks without an assignee", () => {
    const out = buildDueDateNotifications([{ ...task, assignee_id: null }], new Set(), () => provider);
    expect(out).toEqual([]);
  });

  it("deduplicates against existing notifications by user and title", () => {
    const tasks = [task, { ...task, id: "t2", due_date: "2026-07-29" }];
    const existing = new Set(["u1:Task due today: Ship it"]);
    const out = buildDueDateNotifications(tasks, existing, () => provider);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Task due tomorrow: Ship it");
  });

  it("keeps duplicate titles for different users", () => {
    const tasks = [task, { ...task, id: "t2", assignee_id: "u2" }];
    const out = buildDueDateNotifications(tasks, new Set(), () => provider);
    expect(out).toHaveLength(2);
  });
});
