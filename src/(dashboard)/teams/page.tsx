"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Users, Settings } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import { type Team, type TeamMember } from "@/lib/types";
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
  const [inviteEmail, setInviteEmail] = useState("");
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
        const teamList = memberships.map((m) => ({
          ...m.teams,
          role: m.role,
        })).filter(Boolean) as unknown as (Team & { role: string })[];
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

    const { data: { user } } = await supabase.auth.getUser();
    const orgId = "00000000-0000-0000-0000-000000000000";

    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({
        name: newName.trim(),
        slug: generateSlug(newName),
        description: newDesc.trim() || null,
        org_id: orgId,
      })
      .select()
      .single();

    if (team && !teamError && user) {
      await supabase.from("team_members").insert({
        team_id: team.id,
        user_id: user.id,
        role: "owner",
      });
      setTeams([...teams, team]);
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    }
    setCreating(false);
  }

  async function loadMembers(team: Team) {
    setSelectedTeam(team);
    const { data } = await supabase
      .from("team_members")
      .select("*")
      .eq("team_id", team.id);
    if (data) setMembers(data);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTeam || !inviteEmail.trim()) return;

    const { error } = await supabase.from("team_members").insert({
      team_id: selectedTeam.id,
      user_id: inviteEmail.trim(),
      role: "member",
    });

    if (!error) {
      setInviteEmail("");
      loadMembers(selectedTeam);
    }
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
            placeholder="e.g. Future Barbados"
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

      {/* Members Modal */}
      <Modal
        open={!!selectedTeam}
        onClose={() => setSelectedTeam(null)}
        title={selectedTeam ? `${selectedTeam.name} - Members` : ""}
      >
        <div className="space-y-4">
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
                  <Badge variant={member.role === "owner" ? "info" : "default"}>
                    {member.role}
                  </Badge>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              placeholder="Invite by email..."
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <Button type="submit" size="sm">Invite</Button>
          </form>
        </div>
      </Modal>
    </div>
  );
}
