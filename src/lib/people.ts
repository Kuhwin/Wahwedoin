export interface MeetingEventRow {
  team_id: string;
  google_account_id: string | null;
}

export type UserEntitySet = Record<string, Set<string>>;

/**
 * Count how many events each user is involved in. Each event counts once per
 * user, even when it matches via both a team membership and a linked Google
 * account. All `userIds` are present in the result (zero-filled).
 */
export function buildUserMeetingCounts(
  userIds: string[],
  events: MeetingEventRow[],
  userTeamSet: UserEntitySet,
  userAccountSet: UserEntitySet,
): Record<string, number> {
  const counts: Record<string, number> = {};
  userIds.forEach((id) => { counts[id] = 0; });

  for (const ev of events) {
    const affected = new Set<string>();
    for (const [uid, teamSet] of Object.entries(userTeamSet)) {
      if (teamSet.has(ev.team_id)) affected.add(uid);
    }
    if (ev.google_account_id) {
      for (const [uid, accountSet] of Object.entries(userAccountSet)) {
        if (accountSet.has(ev.google_account_id!)) affected.add(uid);
      }
    }
    affected.forEach((uid) => { counts[uid] = (counts[uid] || 0) + 1; });
  }

  return counts;
}

export interface OrgMembershipRow {
  org_id: string;
  role: string;
}

/**
 * True when the caller is an owner/admin of an org that the target user also
 * belongs to.
 */
export function sharesOrgWithAdmin(
  callerMemberships: OrgMembershipRow[],
  targetOrgIds: string[],
): boolean {
  const adminOrgIds = new Set(
    callerMemberships
      .filter((m) => m.role === "owner" || m.role === "admin")
      .map((m) => m.org_id),
  );
  const targetSet = new Set(targetOrgIds);
  return [...adminOrgIds].some((orgId) => targetSet.has(orgId));
}
