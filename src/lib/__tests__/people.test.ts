import { describe, it, expect } from "vitest";
import { buildUserMeetingCounts, sharesOrgWithAdmin } from "../people";

const teamSet = (users: string[], teams: string[][]) =>
  users.reduce<Record<string, Set<string>>>((acc, uid, i) => {
    acc[uid] = new Set(teams[i] || []);
    return acc;
  }, {});

describe("buildUserMeetingCounts", () => {
  it("counts an event once per user via team membership", () => {
    const counts = buildUserMeetingCounts(
      ["u1", "u2"],
      [{ team_id: "t1", google_account_id: null }],
      teamSet(["u1", "u2"], [["t1"], ["t2"]]),
      { u1: new Set(), u2: new Set() },
    );
    expect(counts).toEqual({ u1: 1, u2: 0 });
  });

  it("counts an event via a linked google account", () => {
    const counts = buildUserMeetingCounts(
      ["u1"],
      [{ team_id: "t9", google_account_id: "a1" }],
      teamSet(["u1"], [[]]),
      { u1: new Set(["a1"]) },
    );
    expect(counts).toEqual({ u1: 1 });
  });

  it("counts an event only once when it matches via both team and account", () => {
    const counts = buildUserMeetingCounts(
      ["u1"],
      [{ team_id: "t1", google_account_id: "a1" }],
      teamSet(["u1"], [["t1"]]),
      { u1: new Set(["a1"]) },
    );
    expect(counts).toEqual({ u1: 1 });
  });

  it("counts a shared team event for every member", () => {
    const counts = buildUserMeetingCounts(
      ["u1", "u2"],
      [{ team_id: "t1", google_account_id: null }],
      teamSet(["u1", "u2"], [["t1"], ["t1"]]),
      { u1: new Set(), u2: new Set() },
    );
    expect(counts).toEqual({ u1: 1, u2: 1 });
  });

  it("zero-fills all requested users and handles multiple events", () => {
    const counts = buildUserMeetingCounts(
      ["u1", "u2"],
      [
        { team_id: "t1", google_account_id: null },
        { team_id: "t2", google_account_id: null },
      ],
      teamSet(["u1", "u2"], [["t1", "t2"], []]),
      { u1: new Set(), u2: new Set() },
    );
    expect(counts).toEqual({ u1: 2, u2: 0 });
  });
});

describe("sharesOrgWithAdmin", () => {
  it("returns true when the caller is an admin of the target's org", () => {
    expect(
      sharesOrgWithAdmin([{ org_id: "a", role: "admin" }], ["a"]),
    ).toBe(true);
  });

  it("returns false for a plain member even in the same org", () => {
    expect(
      sharesOrgWithAdmin([{ org_id: "a", role: "member" }], ["a"]),
    ).toBe(false);
  });

  it("returns false when the target belongs to a different org", () => {
    expect(
      sharesOrgWithAdmin([{ org_id: "a", role: "owner" }], ["b"]),
    ).toBe(false);
  });

  it("returns true when the caller is admin of any shared org", () => {
    expect(
      sharesOrgWithAdmin(
        [{ org_id: "a", role: "admin" }, { org_id: "b", role: "owner" }],
        ["b"],
      ),
    ).toBe(true);
  });

  it("returns false for a target with no orgs", () => {
    expect(
      sharesOrgWithAdmin([{ org_id: "a", role: "admin" }], []),
    ).toBe(false);
  });
});
