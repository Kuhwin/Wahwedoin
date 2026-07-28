"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Building2, Users, Settings, Shield, ShieldAlert, UserMinus, UserCog,
  Plus, X, Mail, Copy, Check, Trash2, ArrowRight, Save, UserPlus,
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
  const [orgMemberships, setOrgMemberships] = useState<Record<string, OrgMember>>({});
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [teams, setTeams] = useState<(Team & { role?: string })[]>([]);
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
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamInvites, setTeamInvites] = useState<{ id: string; email: string; role: string }[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [teamMemberProfiles, setTeamMemberProfiles] = useState<Record<string, { display_name: string | null; avatar_url: string | null }>>({});

  const searchParams = useSearchParams();
  const supabase = createClient();

  const myMembership = selectedOrgId ? orgMemberships[selectedOrgId] : null;
  const currentRole = myMembership?.role || null;
  const canManage = currentRole === "owner" || currentRole === "admin";
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

      setLoading(false);
    }
    void loadOrgData();
  }, [selectedOrgId, supabase]);

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
    const { error } = await supabase
      .from("organizations")
      .update({ cover_photo_url: newUrl })
      .eq("id", selectedOrgId);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    setOrgs(orgs.map((o) => o.id === selectedOrgId ? { ...o, cover_photo_url: newUrl } : o));
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

  async function handleChangeRole(member: OrgMember, newRole: "admin" | "member") {
    setMessage(null);
    const { error } = await supabase.rpc("update_org_member_role", { p_member_id: member.id, p_new_role: newRole });
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMembers(members.map((m) => m.id === member.id ? { ...m, role: newRole } : m));
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
      const userIds = mData.map((m: TeamMember) => m.user_id);
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);
      const profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      (profiles || []).forEach((p: { user_id: string; display_name: string | null; avatar_url: string | null }) => {
        profileMap[p.user_id] = p;
      });
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

  async function handleTeamCoverChange(newUrl: string | null) {
    if (!selectedTeam) return;
    const { error } = await supabase
      .from("teams")
      .update({ cover_photo_url: newUrl })
      .eq("id", selectedTeam.id);
    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    const updated = { ...selectedTeam, cover_photo_url: newUrl };
    setSelectedTeam(updated as Team);
    setTeams(teams.map((t) => t.id === updated.id ? { ...t, cover_photo_url: newUrl } : t));
  }

  if (loading && orgs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
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
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
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
                          <button onClick={() => setEditingName(true)} className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">Edit</button>
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
                <button onClick={() => setTab("members")} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 text-left hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
                  <Users size={20} className="text-indigo-500 mb-2" />
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{members.length}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Members</p>
                </button>
                <button onClick={() => setTab("teams")} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 text-left hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
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
                  <button onClick={() => setTab("members")} className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">View all</button>
                </div>
                <div className="space-y-2">
                  {members.slice(0, 5).map((m) => (
                    <div key={m.id} className="flex items-center gap-3">
                      <Avatar email={m.user_id} avatarUrl={m.avatar_url} name={m.display_name} size="sm" />
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
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar email={member.user_id} avatarUrl={member.avatar_url} name={member.display_name} size="sm" />
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
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={member.role === "owner" ? "info" : member.role === "admin" ? "warning" : "default"}>
                            {member.role}
                          </Badge>
                          {canManage && member.role !== "owner" && (
                            <div className="relative group">
                              <button className="p-1 rounded text-slate-400 hover:text-slate-600 transition-colors">
                                <UserCog size={14} />
                              </button>
                              <div className="absolute right-0 top-7 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-20 min-w-[140px] hidden group-hover:block">
                                {member.role === "admin" ? (
                                  <button onClick={() => void handleChangeRole(member, "member")}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700">
                                    <Shield size={12} /> Demote to Member
                                  </button>
                                ) : (
                                  <button onClick={() => void handleChangeRole(member, "admin")}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700">
                                    <ShieldAlert size={12} /> Promote to Admin
                                  </button>
                                )}
                                <button onClick={() => void handleRemoveMember(member.id, member.user_id)}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20">
                                  <UserMinus size={12} /> {member.user_id === user?.id ? "Leave" : "Remove"}
                                </button>
                              </div>
                            </div>
                          )}
                          {member.user_id === user?.id && member.role !== "owner" && (
                            <button onClick={() => void handleRemoveMember(member.id, member.user_id)}
                              className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors" title="Leave">
                              <X size={14} />
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
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
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
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
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
                        <Link href={`/teams/${team.id}`} className="text-slate-300 hover:text-indigo-600 transition-colors">
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
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
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
                canEdit={selectedTeam.role === "owner" || selectedTeam.role === "admin"}
                onChange={(url) => handleTeamCoverChange(url)}
              />
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
                        <Avatar email={m.user_id} avatarUrl={profile?.avatar_url} name={profile?.display_name} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{profile?.display_name || m.user_id}</p>
                          <p className="text-xs text-slate-500">Joined {new Date(m.joined_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={m.role === "owner" ? "info" : "default"}>{m.role}</Badge>
                        {m.role !== "owner" && (
                          <button onClick={() => supabase.from("team_members").delete().eq("id", m.id).then(() => setTeamMembers(teamMembers.filter((tm) => tm.id !== m.id)))}
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
                      <button onClick={() => copyInviteLink(invite.email)} className="p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Copy invite link">
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
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              <UserPlus size={12} className="inline mr-1" /> Invite by email
            </h4>
            <form onSubmit={(e) => void handleInvite(e)} className="space-y-3">
              <div className="flex gap-2">
                <input type="email" placeholder="teammate@email.com" value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" required />
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "admin" | "member" | "viewer")}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
                <Button type="submit" size="sm" disabled={inviting || !inviteEmail.trim()}>{inviting ? "..." : "Invite"}</Button>
              </div>
            </form>
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
    </div>
  );
}
