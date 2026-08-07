"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Building2, Users, Settings, Shield, UserMinus, UserCog,
  Plus, Mail, Copy, Check, Trash2, ArrowRight, Save, UserPlus,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import CoverPhotoUpload from "@/components/CoverPhotoUpload";
import { generateSlug } from "@/lib/utils";
import type { Team, TeamMember } from "@/lib/types";

interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  cover_photo_url: string | null;
}

interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  display_name?: string;
  avatar_url?: string;
  email?: string;
}

type Tab = "overview" | "members" | "teams";

export default function ManagePage() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [orgMemberships, setOrgMemberships] = useState<Record<string, OrgMember>>({});
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [teams, setTeams] = useState<(Team & { role?: string })[]>([]);
  const [myTeamRoles, setMyTeamRoles] = useState<Record<string, "owner" | "admin" | "member" | "viewer">>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  // Org name editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Add member
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "member">("member");
  const [searchResults, setSearchResults] = useState<{ user_id: string; display_name: string; email: string }[]>([]);
  const [, setSearching] = useState(false);
  const [, setAddingMember] = useState(false);

  // Delete org
  const [deleteOrgId, setDeleteOrgId] = useState<string | null>(null);
  const [deletingOrg, setDeletingOrg] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  // Team management
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<(Team & { role?: string }) | null>(null);
  const [teamNameInput, setTeamNameInput] = useState("");
  const [savingTeamName, setSavingTeamName] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamInvites, setTeamInvites] = useState<{ id: string; email: string; role: string }[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [teamMemberProfiles, setTeamMemberProfiles] = useState<Record<string, { display_name: string | null; avatar_url: string | null; email: string | null }>>({});

  // Team add: autocomplete dropdown (add existing org member vs invite by email)
  const [teamAddOpen, setTeamAddOpen] = useState(false);
  const teamAddRef = useRef<HTMLDivElement>(null);

  // Member detail popup (click a person in the org manager)
  const [memberDetail, setMemberDetail] = useState<OrgMember | null>(null);
  const [memberDetailLoading, setMemberDetailLoading] = useState(false);
  const [memberDetailMemberships, setMemberDetailMemberships] = useState<Record<string, { id: string; role: string }>>({});
  const [memberDetailAddRoles, setMemberDetailAddRoles] = useState<Record<string, "admin" | "member" | "viewer">>({});
  const [memberDetailAdding, setMemberDetailAdding] = useState(false);

  const searchParams = useSearchParams();
  const supabase = createClient();

  const myMembership = selectedOrgId ? orgMemberships[selectedOrgId] : null;
  const currentRole = myMembership?.role || null;
  const canManage = currentRole === "owner" || currentRole === "admin";
  const selectedTeamCanEdit = selectedTeam?.role === "owner" || selectedTeam?.role === "admin";
  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      setUser({ id: authUser.id, email: authUser.email || "" });

      const { data: orgMembers } = await supabase
        .from("org_members")
        .select("*, organizations(name, slug, cover_photo_url)")
        .eq("user_id", authUser.id);

      const { data: adminTeams } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", authUser.id)
        .in("role", ["owner", "admin"]);
      const hasAdminOrg = (orgMembers || []).some((m: { role: string }) => m.role === "owner" || m.role === "admin");
      if (!hasAdminOrg && (!adminTeams || adminTeams.length === 0)) {
        setLoading(false);
        return;
      }
      setAuthorized(true);

      if (orgMembers) {
        const orgList: OrgInfo[] = [];
        const membershipMap: Record<string, OrgMember> = {};
        for (const m of orgMembers as (OrgMember & { organizations: { name: string; slug: string; cover_photo_url: string | null } })[]) {
          orgList.push({
            id: m.org_id,
            name: m.organizations?.name || "Unknown",
            slug: m.organizations?.slug || "",
            cover_photo_url: m.organizations?.cover_photo_url ?? null,
          });
          membershipMap[m.org_id] = m;
        }
        setOrgs(orgList);
        setOrgMemberships(membershipMap);

        const orgParam = searchParams.get("org");
        if (orgParam && orgList.some((o) => o.id === orgParam)) {
          setSelectedOrgId(orgParam);
        } else if (orgList.length > 0 && !selectedOrgId) {
          setSelectedOrgId(orgList[0].id);
        }
      }
      setLoading(false);
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, searchParams]);

  useEffect(() => {
    if (!selectedOrgId) return;
    async function loadOrgData() {
      setLoading(true);
      setMessage(null);

      const { data: orgMembers } = await supabase
        .from("org_members")
        .select("*")
        .eq("org_id", selectedOrgId);
      if (orgMembers) {
        const { data: profiles } = await supabase.rpc("get_org_member_profiles", { p_org_id: selectedOrgId });
        const profileMap = new Map<string, { display_name: string; avatar_url: string | null; email: string }>();
        (profiles as { user_id: string; display_name: string; avatar_url: string | null; email: string }[] | null)?.forEach((p) => {
          profileMap.set(p.user_id, p);
        });
        const enriched: OrgMember[] = orgMembers.map((m: OrgMember) => {
          const p = profileMap.get(m.user_id);
          return { ...m, display_name: p?.display_name || undefined, avatar_url: p?.avatar_url || undefined, email: p?.email || undefined };
        });
        setMembers(enriched);
      }

      const { data: teamList } = await supabase
        .from("teams")
        .select("*")
        .eq("org_id", selectedOrgId)
        .order("name");
      setTeams(teamList || []);

      const teamParam = searchParams.get("team");
      const deepLinkedTeam = (teamList || []).find((t: Team) => t.id === teamParam);
      if (deepLinkedTeam) void loadTeamMembers(deepLinkedTeam);

      // Load the caller's role on each team in this org so the team-modal
      // and member-detail popup can gate add/remove on the actual team role
      // (RLS on team_members / team_invites requires team owner or admin).
      const { data: { user: authUser2 } } = await supabase.auth.getUser();
      if (authUser2 && teamList && teamList.length > 0) {
        const teamIds = (teamList as { id: string }[]).map((t) => t.id);
        const { data: myTeamRows } = await supabase
          .from("team_members")
          .select("team_id, role")
          .eq("user_id", authUser2.id)
          .in("team_id", teamIds);
        const roles: Record<string, "owner" | "admin" | "member" | "viewer"> = {};
        ((myTeamRows || []) as { team_id: string; role: string }[]).forEach((r) => {
          roles[r.team_id] = r.role as "owner" | "admin" | "member" | "viewer";
        });
        setMyTeamRoles(roles);
      } else {
        setMyTeamRoles({});
      }

      setLoading(false);
    }
    void loadOrgData();
    // loadTeamMembers is intentionally kept as a local action function; the
    // query parameters and selected organization are the revalidation inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, searchParams, supabase]);

  useEffect(() => {
    setTeamNameInput(selectedTeam?.name || "");
  }, [selectedTeam]);

  // Close the team-add autocomplete dropdown on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (teamAddRef.current && !teamAddRef.current.contains(e.target as Node)) {
        setTeamAddOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // When a member is opened in the detail popup, load their team memberships
  // within this organization.
  useEffect(() => {
    if (!memberDetail || !selectedOrgId) {
      setMemberDetailMemberships({});
      return;
    }
    const detail = memberDetail;
    const orgId = selectedOrgId;
    let cancelled = false;
    async function load() {
      setMemberDetailLoading(true);
      const orgTeamIds = teams.filter((t) => t.org_id === orgId).map((t) => t.id);
      if (orgTeamIds.length === 0) {
        if (!cancelled) {
          setMemberDetailMemberships({});
          setMemberDetailLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("team_members")
        .select("id, team_id, role")
        .eq("user_id", detail.user_id)
        .in("team_id", orgTeamIds);
      if (cancelled) return;
      const map: Record<string, { id: string; role: string }> = {};
      (data || []).forEach((r: { id: string; team_id: string; role: string }) => {
        map[r.team_id] = { id: r.id, role: r.role };
      });
      setMemberDetailMemberships(map);
      setMemberDetailLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [memberDetail, selectedOrgId, teams, supabase]);

  useEffect(() => {
    if (selectedOrg) setNameInput(selectedOrg.name);
  }, [selectedOrg]);

  async function handleSaveName() {
    if (!nameInput.trim() || !selectedOrgId || nameInput.trim() === selectedOrg?.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    setMessage(null);
    const { error } = await supabase.rpc("update_org_name", { p_org_id: selectedOrgId, p_new_name: nameInput.trim() });
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setOrgs(orgs.map((o) => o.id === selectedOrgId ? { ...o, name: nameInput.trim() } : o));
      setMessage({ type: "success", text: "Organization name updated" });
      setEditingName(false);
    }
    setSavingName(false);
  }

  async function handleOrgCoverChange(newUrl: string | null) {
    if (!selectedOrgId) return;
    const { data, error } = await supabase.rpc("update_org_cover", {
      p_org_id: selectedOrgId,
      p_cover_url: newUrl,
    });
    if (error) {
      console.error("[cover-photo] org update failed", error);
      setMessage({ type: "error", text: "Failed to save cover photo: " + error.message });
      return;
    }
    setOrgs(orgs.map((o) => o.id === selectedOrgId ? { ...o, cover_photo_url: data ?? newUrl } : o));
    setMessage({ type: "success", text: newUrl ? "Cover photo updated" : "Cover photo removed" });
  }

  async function handleSearch(query: string) {
    setAddEmail(query);
    if (query.length < 2 || !selectedOrgId) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase.rpc("search_org_candidates", { p_query: query, p_org_id: selectedOrgId });
    if (data) setSearchResults(data as { user_id: string; display_name: string; email: string }[]);
    setSearching(false);
  }

  async function handleAddMember(userId: string, email: string) {
    if (!selectedOrgId) return;
    if (members.some((m) => m.user_id === userId)) {
      setMessage({ type: "error", text: "Already a member" });
      return;
    }
    setAddingMember(true);
    setMessage(null);
    const { data, error } = await supabase
      .from("org_members")
      .insert({ org_id: selectedOrgId, user_id: userId, role: addRole })
      .select()
      .single();
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else if (data) {
      setMembers([...members, { ...data, display_name: "", email }]);
      setAddEmail("");
      setSearchResults([]);
      setMessage({ type: "success", text: `Added ${email}` });
    }
    setAddingMember(false);
  }

  async function handleRemoveMember(memberId: string, userId: string) {
    if (!user) return;
    if (userId === user.id && !window.confirm("Leave this organization?")) return;
    if (userId !== user.id && !window.confirm("Remove this member?")) return;
    setMessage(null);
    const { error } = await supabase.rpc("delete_org_member", { p_member_id: memberId });
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMembers(members.filter((m) => m.id !== memberId));
      if (userId === user.id) { setSelectedOrgId(null); return; }
      setMessage({ type: "success", text: "Member removed" });
    }
  }

  async function handleChangeRole(member: OrgMember, newRole: "owner" | "admin" | "member") {
    setMessage(null);
    if (member.role === newRole) return;
    // Only owners can promote to or demote from owner.
    if ((newRole === "owner" || member.role === "owner") && currentRole !== "owner") {
      setMessage({ type: "error", text: "Only owners can change an owner's role." });
      return;
    }
    // Guard against demoting the last owner.
    if (member.role === "owner" && newRole !== "owner") {
      const ownerCount = members.filter((m) => m.role === "owner").length;
      if (ownerCount <= 1) {
        setMessage({ type: "error", text: "Cannot demote the last owner. Promote another member to owner first." });
        return;
      }
    }
    // Confirm any change that touches the owner role.
    if (member.role === "owner" || newRole === "owner") {
      const label = member.display_name || member.email || member.user_id;
      if (!window.confirm(`Change ${label}'s role from ${member.role} to ${newRole}?`)) return;
    }
    const { error } = await supabase.rpc("update_org_member_role", { p_member_id: member.id, p_new_role: newRole });
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMembers(members.map((m) => m.id === member.id ? { ...m, role: newRole } : m));
      setMessage({ type: "success", text: `Role updated to ${newRole}` });
    }
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim() || !selectedOrgId || !user) return;
    setCreatingTeam(true);
    setMessage(null);

    const teamId = crypto.randomUUID();
    const { error: teamError } = await supabase.from("teams").insert({
      id: teamId,
      org_id: selectedOrgId,
      name: newTeamName.trim(),
      slug: generateSlug(newTeamName) + "-" + crypto.randomUUID().slice(0, 4),
      description: newTeamDesc.trim() || null,
    });
    if (teamError) {
      setMessage({ type: "error", text: teamError.message });
      setCreatingTeam(false);
      return;
    }

    const { error: memberError } = await supabase.rpc("bootstrap_team_owner", {
      p_team_id: teamId,
      p_user_id: user.id,
    });
    if (memberError) {
      setMessage({ type: "error", text: memberError.message });
      setCreatingTeam(false);
      return;
    }

    const { data: team } = await supabase.from("teams").select("*").eq("id", teamId).single();
    if (team) setTeams([...teams, team]);
    setShowCreateTeam(false);
    setNewTeamName("");
    setNewTeamDesc("");
    setMessage({ type: "success", text: "Team created" });
    setCreatingTeam(false);
  }

  async function loadTeamMembers(team: Team) {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    const { data: myMembership } = await supabase
      .from("team_members")
      .select("role")
      .eq("team_id", team.id)
      .eq("user_id", authUser.id)
      .maybeSingle();
    setSelectedTeam({ ...team, role: myMembership?.role });
    const { data: mData } = await supabase.from("team_members").select("*").eq("team_id", team.id);
    if (mData) {
      setTeamMembers(mData);
      // Use the get_org_member_profiles RPC (SECURITY DEFINER) to fetch
      // display_name + avatar_url + email for every team member. This
      // bypasses the restrictive user_profiles SELECT RLS and gives us
      // a real email fallback for users who have no display_name yet,
      // so the UI no longer falls back to a raw UUID.
      const orgId = team.org_id ?? selectedOrgId;
      const profileMap: Record<string, { display_name: string | null; avatar_url: string | null; email: string | null }> = {};
      if (orgId) {
        const { data: orgProfiles } = await supabase.rpc("get_org_member_profiles", { p_org_id: orgId });
        (orgProfiles || []).forEach((p: { user_id: string; display_name: string | null; avatar_url: string | null; email: string | null }) => {
          profileMap[p.user_id] = {
            display_name: p.display_name || null,
            avatar_url: p.avatar_url || null,
            email: p.email || null,
          };
        });
      }
      setTeamMemberProfiles(profileMap);
    }
    const { data: invitesData } = await supabase
      .from("team_invites")
      .select("*")
      .eq("team_id", team.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (invitesData) setTeamInvites(invitesData);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTeam || !inviteEmail.trim() || !user) return;
    setInviting(true);
    setMessage(null);

    const { data: invite, error } = await supabase.from("team_invites").insert({
      team_id: selectedTeam.id,
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
      invited_by: user.id,
    }).select().single();

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else if (invite) {
      setTeamInvites([invite, ...teamInvites]);
      setInviteEmail("");
    }
    setInviting(false);
  }

  function copyInviteLink(email: string) {
    const url = `${window.location.origin}/auth/signup?invite=${encodeURIComponent(email)}`;
    navigator.clipboard.writeText(url);
    setCopied(email);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleRevokeInvite(inviteId: string) {
    await supabase.from("team_invites").delete().eq("id", inviteId);
    setTeamInvites(teamInvites.filter((i) => i.id !== inviteId));
  }

  // Add an existing organization member directly to the currently selected team.
  // Goes through the add_team_member SECURITY DEFINER RPC, which performs an
  // explicit server-side role check and replaces the fragile RLS subquery.
  async function handleAddExistingToTeam(member: OrgMember) {
    if (!selectedTeam) return;
    setMessage(null);
    const { data, error } = await supabase.rpc("add_team_member", {
      p_team_id: selectedTeam.id,
      p_user_id: member.user_id,
      p_role: inviteRole,
    });
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    if (data) {
      const inserted = data as unknown as TeamMember;
      setTeamMembers([...teamMembers, inserted]);
      const profile = {
        display_name: member.display_name ?? null,
        avatar_url: member.avatar_url ?? null,
        email: member.email ?? null,
      };
      setTeamMemberProfiles({ ...teamMemberProfiles, [member.user_id]: profile });
    }
    setInviteEmail("");
    setTeamAddOpen(false);
    setMessage({ type: "success", text: `Added ${member.display_name || member.email || "member"} to the team` });
  }

  // Member-detail popup: add this member to a team they're not yet on.
  // Goes through the add_team_member SECURITY DEFINER RPC for the same
  // reason as handleAddExistingToTeam above.
  async function handleMemberDetailAdd(teamId: string) {
    if (!memberDetail) return;
    const role = memberDetailAddRoles[teamId] ?? "member";
    setMemberDetailAdding(true);
    setMessage(null);
    const { data, error } = await supabase.rpc("add_team_member", {
      p_team_id: teamId,
      p_user_id: memberDetail.user_id,
      p_role: role,
    });
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else if (data) {
      const inserted = data as unknown as TeamMember;
      setMemberDetailMemberships({ ...memberDetailMemberships, [teamId]: { id: inserted.id, role: inserted.role } });
      setMessage({ type: "success", text: "Added to team" });
    }
    setMemberDetailAdding(false);
  }

  async function handleMemberDetailRemove(teamId: string) {
    const m = memberDetailMemberships[teamId];
    if (!m) return;
    setMessage(null);
    const { error } = await supabase.from("team_members").delete().eq("id", m.id);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    const next = { ...memberDetailMemberships };
    delete next[teamId];
    setMemberDetailMemberships(next);
    setMessage({ type: "success", text: "Removed from team" });
  }

  async function handleTeamCoverChange(newUrl: string | null) {
    if (!selectedTeam) return;
    const { data, error } = await supabase.rpc("update_team_cover", {
      p_team_id: selectedTeam.id,
      p_cover_url: newUrl,
    });
    if (error) {
      console.error("[cover-photo] team update failed", error);
      setMessage({ type: "error", text: "Failed to save cover photo: " + error.message });
      return;
    }
    const savedUrl = data ?? newUrl;
    const updated = { ...selectedTeam, cover_photo_url: savedUrl };
    setSelectedTeam(updated as Team);
    setTeams(teams.map((t) => t.id === updated.id ? { ...t, cover_photo_url: savedUrl } : t));
    setMessage({ type: "success", text: newUrl ? "Cover photo updated" : "Cover photo removed" });
  }

  async function handleSaveTeamName() {
    if (!selectedTeam || !teamNameInput.trim() || teamNameInput.trim() === selectedTeam.name) return;
    setSavingTeamName(true);
    setMessage(null);
    const { error } = await supabase
      .from("teams")
      .update({ name: teamNameInput.trim() })
      .eq("id", selectedTeam.id);
    if (error) {
      setMessage({ type: "error", text: "Failed to update team name: " + error.message });
    } else {
      const updated = { ...selectedTeam, name: teamNameInput.trim() };
      setSelectedTeam(updated);
      setTeams(teams.map((t) => t.id === updated.id ? { ...t, name: updated.name } : t));
      setMessage({ type: "success", text: "Team name updated" });
    }
    setSavingTeamName(false);
  }

  async function handleChangeTeamMemberRole(member: TeamMember, newRole: TeamMember["role"]) {
    if (!selectedTeam || !selectedTeamCanEdit || member.role === newRole) return;
    const { error } = await supabase.rpc("update_team_member_role", {
      p_member_id: member.id,
      p_new_role: newRole,
    });
    if (error) {
      setMessage({ type: "error", text: "Failed to update role: " + error.message });
    } else {
      setTeamMembers(teamMembers.map((m) => m.id === member.id ? { ...m, role: newRole } : m));
      setMessage({ type: "success", text: "Member role updated" });
    }
  }

  if (loading && orgs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <Shield size={48} className="text-slate-300 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">Admin access required</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Manage is available to organization and team owners or admins.</p>
      </div>
    );
  }

  if (orgs.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <Building2 size={48} className="text-slate-300 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">No organizations found</h1>
        <p className="text-sm text-slate-500">You aren&apos;t a member of any organization.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          message.type === "error"
            ? "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
            : "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
        }`}>
          <div className="flex items-center justify-between">
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="ml-3 text-current opacity-60 hover:opacity-100">x</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center dark:bg-indigo-900/30">
            <Building2 size={24} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Manage</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Organization & teams</p>
          </div>
        </div>
      </div>

      {/* Org tabs + page tabs */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          {orgs.length > 1 ? orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => setSelectedOrgId(org.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                selectedOrgId === org.id
                  ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-slate-100"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <Building2 size={12} className="inline mr-1" />
              {org.name}
            </button>
          )) : selectedOrg ? (
            <h2 className="px-2 py-1 text-base font-semibold text-slate-900 dark:text-slate-100">{selectedOrg.name}</h2>
          ) : null}
        </div>

        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          {(["overview", "members", "teams"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                tab === t ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {t === "overview" && <Building2 size={12} className="inline mr-1" />}
              {t === "members" && <Users size={12} className="inline mr-1" />}
              {t === "teams" && <Settings size={12} className="inline mr-1" />}
              {t}
            </button>
          ))}
        </div>
      </div>

      {!selectedOrgId ? (
        <p className="text-sm text-slate-500 text-center py-8">Select an organization to manage</p>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Overview Tab */}
          {tab === "overview" && (
            <div className="space-y-6">
              {/* Org Info Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Organization</h3>
                  {canManage && (
                    <button
                      onClick={() => { setDeleteOrgId(selectedOrgId); setDeleteConfirm(""); }}
                      className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 flex items-center gap-1"
                    >
                      <Trash2 size={12} /> Delete Organisation
                    </button>
                  )}
                </div>
                <div className="mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
                  <CoverPhotoUpload
                    bucket="org-covers"
                    ownerId={selectedOrgId || ""}
                    currentUrl={selectedOrg?.cover_photo_url ?? null}
                    fallbackText={selectedOrg?.name || ""}
                    shape="compact"
                    aspectRatio={16 / 9}
                    canEdit={canManage}
                    onChange={(url) => handleOrgCoverChange(url)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    {editingName ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") void handleSaveName(); if (e.key === "Escape") { setNameInput(selectedOrg?.name || ""); setEditingName(false); }}}
                        />
                        <Button size="sm" onClick={() => void handleSaveName()} disabled={savingName}>
                          <Save size={14} />
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => { setNameInput(selectedOrg?.name || ""); setEditingName(false); }}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-medium text-slate-900 dark:text-slate-100">{selectedOrg?.name}</p>
                        {canManage && (
                          <button onClick={() => setEditingName(true)} className="text-xs text-accent hover:text-accent/80 dark:text-indigo-400">Edit</button>
                        )}
                      </div>
                    )}
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {members.length} member{members.length !== 1 ? "s" : ""} &middot; {teams.length} team{teams.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <Badge variant={currentRole === "owner" ? "info" : currentRole === "admin" ? "warning" : "default"}>
                    {currentRole || "member"}
                  </Badge>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button onClick={() => setTab("members")} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 text-left hover:border-accent/30 dark:hover:border-indigo-600 transition-colors">
                  <Users size={20} className="text-indigo-500 mb-2" />
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{members.length}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Members</p>
                </button>
                <button onClick={() => setTab("teams")} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 text-left hover:border-accent/30 dark:hover:border-indigo-600 transition-colors">
                  <Settings size={20} className="text-indigo-500 mb-2" />
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{teams.length}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Teams</p>
                </button>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                  <Shield size={20} className="text-indigo-500 mb-2" />
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{members.filter((m) => m.role === "owner" || m.role === "admin").length}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Admins</p>
                </div>
              </div>

              {/* Recent Members Preview */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Recent Members</h3>
                  <button onClick={() => setTab("members")} className="text-xs text-accent hover:text-accent/80 dark:text-indigo-400">View all</button>
                </div>
                <div className="space-y-2">
                  {members.slice(0, 5).map((m) => (
                    <div key={m.id} className="flex items-center gap-3">
                      <Avatar email={m.email || m.user_id} avatarUrl={m.avatar_url} name={m.display_name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {m.display_name || m.email || m.user_id}
                          {m.user_id === user?.id && <span className="text-slate-400 font-normal"> (you)</span>}
                        </p>
                      </div>
                      <Badge variant={m.role === "owner" ? "info" : m.role === "admin" ? "warning" : "default"}>{m.role}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Members Tab */}
          {tab === "members" && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Members ({members.length})</h3>
                <div className="space-y-2">
                  {members.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No members</p>
                  ) : (
                    members.map((member) => (
                      <div key={member.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg dark:bg-slate-800">
                        <button
                          type="button"
                          onClick={() => setMemberDetail(member)}
                          className="flex items-center gap-3 min-w-0 text-left rounded-md -m-1 p-1 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors flex-1"
                          title="View teams and manage membership"
                        >
                          <Avatar email={member.email || member.user_id} avatarUrl={member.avatar_url} name={member.display_name} size="sm" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {member.display_name || member.email || member.user_id}
                              {member.user_id === user?.id && <span className="text-slate-400 font-normal"> (you)</span>}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Joined {new Date(member.joined_at).toLocaleDateString()}
                              {member.email && member.display_name ? ` · ${member.email}` : ""}
                            </p>
                          </div>
                        </button>
                        <div
                          className="flex items-center gap-2 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canManage ? (
                            <select
                              value={member.role}
                              onChange={(e) => void handleChangeRole(member, e.target.value as "owner" | "admin" | "member")}
                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                              title="Change role"
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                              {currentRole === "owner" && <option value="owner">Owner</option>}
                            </select>
                          ) : (
                            <Badge variant={member.role === "owner" ? "info" : member.role === "admin" ? "warning" : "default"}>
                              {member.role}
                            </Badge>
                          )}
                          {((member.user_id !== user?.id && canManage) ||
                            (member.user_id === user?.id && member.role !== "owner")) && (
                            <button
                              onClick={() => void handleRemoveMember(member.id, member.user_id)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                              title={member.user_id === user?.id ? "Leave this organization" : "Remove this member"}
                            >
                              <UserMinus size={12} /> {member.user_id === user?.id ? "Leave" : "Remove"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Member */}
              {canManage && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    <UserCog size={12} className="inline mr-1" /> Add Member
                  </h4>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input type="text" placeholder="Search by name or email..."
                        value={addEmail} onChange={(e) => void handleSearch(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                      />
                      {searchResults.length > 0 && addEmail.length >= 2 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-30 max-h-40 overflow-y-auto">
                          {searchResults.map((r) => (
                            <button key={r.user_id} onClick={() => void handleAddMember(r.user_id, r.email)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700 text-left">
                              <Avatar email={r.user_id} name={r.display_name} size="xs" />
                              <div className="truncate">
                                <div className="truncate font-medium">{r.display_name || "Unknown"}</div>
                                <div className="text-xs text-slate-400 truncate">{r.email}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <select value={addRole} onChange={(e) => setAddRole(e.target.value as "admin" | "member")}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Teams Tab */}
          {tab === "teams" && (
            <div className="space-y-3">
              {canManage && (
                <div className="flex justify-end">
                  <Button onClick={() => setShowCreateTeam(true)}>
                    <Plus size={16} /> New Team
                  </Button>
                </div>
              )}
              {teams.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl">
                  <Users size={40} className="text-slate-300 mx-auto mb-3" />
                  <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">No teams</h3>
                  <p className="text-xs text-slate-500 mb-3">Create your first team in this organization</p>
                  {canManage && (
                    <Button size="sm" onClick={() => setShowCreateTeam(true)}>
                      <Plus size={14} /> Create Team
                    </Button>
                  )}
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl divide-y divide-slate-200 dark:divide-slate-700">
                  {teams.map((team) => (
                    <div key={team.id} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <Link href={`/teams/${team.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center dark:bg-indigo-900/30">
                          <Users size={16} className="text-indigo-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{team.name}</p>
                          {team.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{team.description}</p>
                          )}
                        </div>
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => void loadTeamMembers(team)}>
                          <Settings size={13} /> Manage
                        </Button>
                        <Link href={`/teams/${team.id}`} className="text-slate-300 hover:text-accent transition-colors">
                          <ArrowRight size={14} />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Create Team Modal */}
      <Modal open={showCreateTeam} onClose={() => setShowCreateTeam(false)} title="Create Team">
        <form onSubmit={handleCreateTeam} className="space-y-4">
          <Input label="Team Name" placeholder="e.g. Nuffinarians" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} required />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
            <textarea placeholder="What does this team do?" value={newTeamDesc}
              onChange={(e) => setNewTeamDesc(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 resize-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              rows={3} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreateTeam(false)}>Cancel</Button>
            <Button type="submit" disabled={creatingTeam}>{creatingTeam ? "Creating..." : "Create Team"}</Button>
          </div>
        </form>
      </Modal>

      {/* Team Manage Modal */}
      <Modal open={!!selectedTeam} onClose={() => setSelectedTeam(null)} title={selectedTeam ? `${selectedTeam.name} - Manage` : ""}>
        <div className="space-y-5">
          {selectedTeam && (
            <div>
              <CoverPhotoUpload
                bucket="team-covers"
                ownerId={selectedTeam.id}
                currentUrl={selectedTeam.cover_photo_url ?? null}
                fallbackText={selectedTeam.name}
                shape="compact"
                aspectRatio={16 / 9}
                canEdit={selectedTeam.role === "owner" || selectedTeam.role === "admin"}
                onChange={(url) => handleTeamCoverChange(url)}
              />
              {selectedTeamCanEdit && (
                <div className="mt-4 flex items-end gap-2">
                  <Input
                    label="Team Name"
                    value={teamNameInput}
                    onChange={(e) => setTeamNameInput(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => void handleSaveTeamName()}
                    disabled={savingTeamName || !teamNameInput.trim() || teamNameInput.trim() === selectedTeam.name}
                  >
                    <Save size={13} />
                    {savingTeamName ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </div>
          )}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Members ({teamMembers.length})</h4>
            <div className="space-y-2">
              {teamMembers.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No members</p>
              ) : (
                teamMembers.map((m) => {
                  const profile = teamMemberProfiles[m.user_id];
                  return (
                    <div key={m.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg dark:bg-slate-800">
                      <div className="flex items-center gap-3">
                        <Avatar email={profile?.email || m.user_id} avatarUrl={profile?.avatar_url} name={profile?.display_name} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{profile?.display_name || profile?.email || m.user_id}</p>
                          <p className="text-xs text-slate-500">Joined {new Date(m.joined_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedTeamCanEdit && (selectedTeam?.role === "owner" || m.role !== "owner") ? (
                          <select
                            value={m.role}
                            onChange={(e) => void handleChangeTeamMemberRole(m, e.target.value as TeamMember["role"])}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                            aria-label={`Role for ${profile?.display_name || profile?.email || m.user_id}`}
                          >
                            {selectedTeam?.role === "owner" && <option value="owner">Owner</option>}
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        ) : (
                          <Badge variant={m.role === "owner" ? "info" : "default"}>{m.role}</Badge>
                        )}
                        {m.role !== "owner" && selectedTeamCanEdit && (
                          <button onClick={() => supabase.from("team_members").delete().eq("id", m.id).then((result: { error: { message: string } | null }) => {
                            const { error } = result;
                            if (error) setMessage({ type: "error", text: "Failed to remove member: " + error.message });
                            else {
                              setTeamMembers(teamMembers.filter((tm) => tm.id !== m.id));
                              setMessage({ type: "success", text: "Member removed" });
                            }
                          })}
                            className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors" title="Remove">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {teamInvites.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Pending Invites ({teamInvites.length})</h4>
              <div className="space-y-2">
                {teamInvites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg dark:bg-amber-900/20 dark:border-amber-800">
                    <div className="flex items-center gap-3">
                      <Mail size={16} className="text-amber-600" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{invite.email}</p>
                        <p className="text-xs text-slate-500">Invited as {invite.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => copyInviteLink(invite.email)} className="p-1.5 rounded text-slate-400 hover:text-accent hover:bg-indigo-50 transition-colors" title="Copy invite link">
                        {copied === invite.email ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                      </button>
                      <button onClick={() => void handleRevokeInvite(invite.id)} className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Revoke">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            {selectedTeamCanEdit ? (
              <>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  <UserPlus size={12} className="inline mr-1" /> Add to team
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Start typing a name to add someone from this organization, or type a full email to invite a new person.
                </p>
            <form onSubmit={(e) => void handleInvite(e)} className="space-y-3">
              <div className="flex gap-2">
                <div ref={teamAddRef} className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Search members or type an email to invite…"
                    value={inviteEmail}
                    onChange={(e) => { setInviteEmail(e.target.value); setTeamAddOpen(true); }}
                    onFocus={() => setTeamAddOpen(true)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                  {teamAddOpen && (() => {
                    const q = inviteEmail.trim().toLowerCase();
                    const onTeamIds = new Set(teamMembers.map((m) => m.user_id));
                    const invitedEmails = new Set(teamInvites.map((i) => i.email.toLowerCase()));
                    const matches = members
                      .filter((m) => {
                        if (onTeamIds.has(m.user_id)) return false;
                        const email = (m.email || "").toLowerCase();
                        if (email && invitedEmails.has(email)) return false;
                        if (!q) return true;
                        return (
                          (m.display_name || "").toLowerCase().includes(q) ||
                          email.includes(q) ||
                          m.user_id.toLowerCase().includes(q)
                        );
                      })
                      .slice(0, 8);
                    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim());
                    const exactOrgEmail = members.some((m) => (m.email || "").toLowerCase() === q);
                    const showInviteOption = isEmail && !exactOrgEmail;
                    if (matches.length === 0 && !showInviteOption) return null;
                    return (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-30 max-h-64 overflow-y-auto">
                        {matches.length > 0 && (
                          <div className="py-1">
                            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Add from organization</p>
                            {matches.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => void handleAddExistingToTeam(m)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700 text-left"
                              >
                                <Avatar email={m.email || m.user_id} avatarUrl={m.avatar_url} name={m.display_name} size="xs" />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium">{m.display_name || m.email || m.user_id}</div>
                                  {m.email && <div className="text-xs text-slate-400 truncate">{m.email}</div>}
                                </div>
                                <span className="text-xs text-slate-400">as {inviteRole}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {showInviteOption && (
                          <div className="py-1 border-t border-slate-100 dark:border-slate-700">
                            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Invite by email</p>
                            <button
                              type="submit"
                              onClick={() => setTeamAddOpen(false)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700 text-left"
                            >
                              <Mail size={14} className="text-slate-400" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">Send invite to {inviteEmail.trim()}</div>
                                <div className="text-xs text-slate-400">They&apos;ll join the team when they sign up</div>
                              </div>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "admin" | "member" | "viewer")}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    inviting ||
                    !inviteEmail.trim() ||
                    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim()) ||
                    members.some((m) => (m.email || "").toLowerCase() === inviteEmail.trim().toLowerCase())
                  }
                  title="Send an email invite to a new person"
                >
                  {inviting ? "..." : "Send invite"}
                </Button>
              </div>
            </form>
              </>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Only team admins and owners can add or invite members.
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* Delete Org Confirmation */}
      <Modal open={!!deleteOrgId} onClose={() => { setDeleteOrgId(null); setDeleteConfirm(""); }} title="Delete Organization">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Are you sure you want to delete <strong>{selectedOrg?.name}</strong>? This will permanently remove
            the organization, all its teams, projects, tasks, and members. This action cannot be undone.
          </p>
          <div>
            <label className="block text-xs font-medium text-red-600 mb-1">
              Type <strong>delete</strong> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="type 'delete'"
              className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-red-300 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-red-800 dark:bg-slate-800 dark:text-slate-100"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && deleteConfirm === "delete") { e.preventDefault(); } }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setDeleteOrgId(null); setDeleteConfirm(""); }} disabled={deletingOrg}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!selectedOrgId) return;
                setDeletingOrg(true);
                setMessage(null);
                const { error } = await supabase.rpc("delete_org", { p_org_id: selectedOrgId });
                if (error) {
                  setMessage({ type: "error", text: error.message });
                  setDeletingOrg(false);
                  setDeleteOrgId(null);
                  setDeleteConfirm("");
                } else {
                  setOrgs(orgs.filter((o) => o.id !== selectedOrgId));
                  setSelectedOrgId(orgs.find((o) => o.id !== selectedOrgId)?.id || null);
                  setDeleteOrgId(null);
                  setDeletingOrg(false);
                  setDeleteConfirm("");
                  setTab("overview");
                  setMessage({ type: "success", text: "Organization deleted" });
                }
              }}
              disabled={deletingOrg || deleteConfirm !== "delete"}
            >
              {deletingOrg ? "Deleting..." : "Delete Organization"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Member detail popup - shows teams in this org and lets you add/remove */}
      <Modal
        open={!!memberDetail}
        onClose={() => { setMemberDetail(null); setMemberDetailAddRoles({}); }}
        title={memberDetail ? (memberDetail.display_name || memberDetail.email || "Member") : "Member"}
        size="lg"
      >
        {memberDetail && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar email={memberDetail.user_id} avatarUrl={memberDetail.avatar_url} name={memberDetail.display_name} size="md" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {memberDetail.display_name || memberDetail.email || memberDetail.user_id}
                </p>
                {memberDetail.email && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{memberDetail.email}</p>
                )}
              </div>
              <Badge variant={memberDetail.role === "owner" ? "info" : memberDetail.role === "admin" ? "warning" : "default"}>
                {memberDetail.role}
              </Badge>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                <Users size={12} className="inline mr-1" /> Teams in this organization
              </h4>
              {memberDetailLoading ? (
                <p className="text-sm text-slate-500 text-center py-3">Loading…</p>
              ) : teams.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-3">No teams yet in this organization.</p>
              ) : (
                <div className="space-y-2">
                  {teams.map((team) => {
                    const membership = memberDetailMemberships[team.id];
                    const myRole = myTeamRoles[team.id];
                    const canEditTeam = myRole === "owner" || myRole === "admin";
                    const addRole = memberDetailAddRoles[team.id] ?? "member";
                    return (
                      <div key={team.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg dark:bg-slate-800">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{team.name}</p>
                          {team.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{team.description}</p>
                          )}
                        </div>
                        {membership ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={membership.role === "owner" ? "info" : "default"}>{membership.role}</Badge>
                            {canEditTeam && membership.role !== "owner" && (
                              <Button size="sm" variant="secondary" onClick={() => void handleMemberDetailRemove(team.id)}>
                                Remove
                              </Button>
                            )}
                          </div>
                        ) : canEditTeam ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <select
                              value={addRole}
                              onChange={(e) => setMemberDetailAddRoles({ ...memberDetailAddRoles, [team.id]: e.target.value as "admin" | "member" | "viewer" })}
                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                              title={`Role to assign in ${team.name}`}
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                              <option value="viewer">Viewer</option>
                            </select>
                            <Button size="sm" onClick={() => void handleMemberDetailAdd(team.id)} disabled={memberDetailAdding}>
                              <Plus size={12} className="mr-1" /> Add
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Not a member</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
