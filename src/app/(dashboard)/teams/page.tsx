"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Users, Settings, Mail, Trash2, UserPlus, Copy, Check } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import { type Team, type TeamMember, type TeamInvite } from "@/lib/types";
import { generateSlug } from "@/lib/utils";

export default function TeamsPage() {
  const [teams, setTeams] = useState<(Team & { members?: TeamMember[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberships } = await supabase
        .from("team_members")
        .select("team_id, teams(*), role")
        .eq("user_id", user.id);

      if (memberships) {
        const teamList = (memberships as { teams: Team; role: string }[]).map((m) => ({
          ...m.teams,
          role: m.role,
        })).filter(Boolean) as (Team & { role: string })[];
        setTeams(teamList);
      }
      setLoading(false);
    }
    void load();
  }, [supabase]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setMessage(null);

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setMessage({ type: "error", text: "You must be logged in to create a team." });
        setCreating(false);
        return;
      }

      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("id")
        .limit(1)
        .single();

      if (orgError || !org) {
        setMessage({ type: "error", text: "Could not find organization. Please contact support." });
        setCreating(false);
        return;
      }

      const { data: team, error: teamError } = await supabase
        .from("teams")
        .insert({
          org_id: org.id,
          name: newName.trim(),
          slug: generateSlug(newName),
          description: newDesc.trim() || null,
        })
        .select()
        .single();

      if (teamError) {
        setMessage({ type: "error", text: teamError.message || "Failed to create team." });
        setCreating(false);
        return;
      }

      const { error: memberError } = await supabase.from("team_members").insert({
        team_id: team.id,
        user_id: user.id,
        role: "owner",
      });

      if (memberError) {
        setMessage({ type: "error", text: "Team created but failed to add you as owner." });
        setCreating(false);
        return;
      }

      setTeams([...teams, team]);
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      setMessage({ type: "success", text: "Team created successfully!" });
    } catch {
      setMessage({ type: "error", text: "An unexpected error occurred." });
    }
    setCreating(false);
  }

  async function loadMembers(team: Team) {
    setSelectedTeam(team);
    setMessage(null);

    const { data: membersData } = await supabase
      .from("team_members")
      .select("*")
      .eq("team_id", team.id);
    if (membersData) setMembers(membersData);

    const { data: invitesData } = await supabase
      .from("team_invites")
      .select("*")
      .eq("team_id", team.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (invitesData) setInvites(invitesData);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTeam || !inviteEmail.trim()) return;
    setInviting(true);
    setMessage(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check if already a member
    const alreadyMember = members.some(
      (m) => m.user_email?.toLowerCase() === inviteEmail.trim().toLowerCase()
    );
    if (alreadyMember) {
      setMessage({ type: "error", text: "This person is already a team member." });
      setInviting(false);
      return;
    }

    // Check if already invited
    const alreadyInvited = invites.some(
      (i) => i.email.toLowerCase() === inviteEmail.trim().toLowerCase()
    );
    if (alreadyInvited) {
      setMessage({ type: "error", text: "This person already has a pending invite." });
      setInviting(false);
      return;
    }

    const { data: invite, error } = await supabase
      .from("team_invites")
      .insert({
        team_id: selectedTeam.id,
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        invited_by: user.id,
      })
      .select()
      .single();

    if (error) {
      setMessage({ type: "error", text: error.message || "Failed to send invite." });
    } else if (invite) {
      // Create notification for the invited user (find their user_id if they exist)
      const { data: inviteeProfile } = await supabase
        .from("user_profiles")
        .select("user_id")
        .eq("user_id", inviteEmail.trim())
        .maybeSingle();

      if (inviteeProfile) {
        await supabase.from("notifications").insert({
          user_id: inviteeProfile.user_id,
          title: `You've been invited to ${selectedTeam.name}`,
          body: `You've been invited as a ${inviteRole}. Check your email for the invite link.`,
          type: "member",
          link: `/teams`,
        });
      }

      setInvites([invite, ...invites]);
      setInviteEmail("");
      setMessage({ type: "success", text: `Invite sent to ${invite.email}` });
    }
    setInviting(false);
  }

  async function handleRevokeInvite(inviteId: string) {
    await supabase.from("team_invites").delete().eq("id", inviteId);
    setInvites(invites.filter((i) => i.id !== inviteId));
  }

  function copyInviteLink(email: string) {
    const url = `${window.location.origin}/auth/signup?invite=${encodeURIComponent(email)}`;
    navigator.clipboard.writeText(url);
    setCopied(email);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleRemoveMember(memberId: string) {
    await supabase.from("team_members").delete().eq("id", memberId);
    setMembers(members.filter((m) => m.id !== memberId));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            message.type === "error"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-green-50 text-green-700 border border-green-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="ml-3 text-current opacity-60 hover:opacity-100"
            >
              x
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teams</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your teams and members</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          New Team
        </Button>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-16">
          <Users size={48} className="text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No teams yet</h3>
          <p className="text-sm text-slate-500 mb-4">Create your first team to get started</p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            Create Team
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {teams.map((team) => (
            <div
              key={team.id}
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-indigo-300 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <Users size={20} className="text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{team.name}</h3>
                    {team.description && (
                      <p className="text-sm text-slate-500">{team.description}</p>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => loadMembers(team)}>
                  <Settings size={14} />
                  Manage
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Team">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Team Name"
            placeholder="e.g. Nuffinarians"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Description</label>
            <textarea
              placeholder="What does this team do?"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create Team"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Members & Invite Modal */}
      <Modal
        open={!!selectedTeam}
        onClose={() => setSelectedTeam(null)}
        title={selectedTeam ? `${selectedTeam.name} - Members` : ""}
      >
        <div className="space-y-5">
          {/* Current Members */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Members ({members.length})</h4>
            <div className="space-y-2">
              {members.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No members yet</p>
              ) : (
                members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Avatar email={member.user_email || member.user_id} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{member.user_email || member.user_id}</p>
                        <p className="text-xs text-slate-500">Joined {new Date(member.joined_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={member.role === "owner" ? "info" : "default"}>
                        {member.role}
                      </Badge>
                      {member.role !== "owner" && (
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors"
                          title="Remove member"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pending Invites */}
          {invites.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Pending Invites ({invites.length})</h4>
              <div className="space-y-2">
                {invites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Mail size={16} className="text-amber-600" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{invite.email}</p>
                        <p className="text-xs text-slate-500">Invited as {invite.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyInviteLink(invite.email)}
                        className="p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="Copy invite link"
                      >
                        {copied === invite.email ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                      </button>
                      <button
                        onClick={() => handleRevokeInvite(invite.id)}
                        className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Revoke invite"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invite Form */}
          <div className="border-t border-slate-200 pt-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              <UserPlus size={12} className="inline mr-1" />
              Invite by email
            </h4>
            <form onSubmit={(e) => void handleInvite(e)} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="teammate@email.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "admin" | "member" | "viewer")}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
                <Button type="submit" size="sm" disabled={inviting || !inviteEmail.trim()}>
                  {inviting ? "..." : "Invite"}
                </Button>
              </div>
              <p className="text-[11px] text-slate-400">
                They&apos;ll receive a notification and can sign up with this email to join the team.
              </p>
            </form>
          </div>
        </div>
      </Modal>
    </div>
  );
}
