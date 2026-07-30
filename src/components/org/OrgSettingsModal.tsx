"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, UserMinus, Shield, ShieldAlert, UserCog, Save } from "lucide-react";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";

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

interface OrgSettingsModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string;
  onOrgUpdated: (orgId: string, newName: string) => void;
}

export default function OrgSettingsModal({ open, onClose, orgId, orgName, onOrgUpdated }: OrgSettingsModalProps) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(orgName);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "member">("member");
  const [, setAdding] = useState(false);
  const [searchResults, setSearchResults] = useState<{ user_id: string; display_name: string; email: string }[]>([]);
  const [, setSearching] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (!open) return;
    async function load() {
      setLoading(true);
      setMessage(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: orgMembers } = await supabase
        .from("org_members")
        .select("*")
        .eq("org_id", orgId);

      if (orgMembers) {
        type OrgMemberRow = { id: string; org_id: string; user_id: string; role: "owner" | "admin" | "member"; joined_at: string };

        const { data: profiles } = await supabase.rpc("get_org_member_profiles", { p_org_id: orgId });
        const profileMap = new Map<string, { display_name: string; avatar_url: string | null; email: string }>();
        (profiles as { user_id: string; display_name: string; avatar_url: string | null; email: string }[] | null)?.forEach((p) => {
          profileMap.set(p.user_id, p);
        });

        const enriched: OrgMember[] = orgMembers.map((m: OrgMemberRow) => {
          const p = profileMap.get(m.user_id);
          return {
            ...m,
            display_name: p?.display_name || undefined,
            avatar_url: p?.avatar_url || undefined,
            email: p?.email || undefined,
          };
        });

        const myMembership = orgMembers.find((m: OrgMemberRow) => m.user_id === user.id);
        setCurrentUserRole(myMembership?.role || null);
        setMembers(enriched);
      }
      setLoading(false);
    }
    void load();
  }, [open, orgId, supabase]);

  useEffect(() => {
    setNameInput(orgName);
  }, [orgName]);

  async function handleSaveName() {
    if (!nameInput.trim() || nameInput.trim() === orgName) {
      setEditingName(false);
      return;
    }
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.rpc("update_org_name", { p_org_id: orgId, p_new_name: nameInput.trim() });
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Organization name updated" });
      setEditingName(false);
      onOrgUpdated(orgId, nameInput.trim());
    }
    setSaving(false);
  }

  async function handleRemoveMember(memberId: string, userId: string) {
    if (userId === currentUserId) {
      if (!window.confirm("Leave this organization?")) return;
    } else {
      if (!window.confirm("Remove this member from the organization?")) return;
    }
    setMessage(null);
    const { error } = await supabase.rpc("delete_org_member", { p_member_id: memberId });
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMembers(members.filter((m) => m.id !== memberId));
      if (userId === currentUserId) {
        onClose();
        return;
      }
      setMessage({ type: "success", text: "Member removed" });
    }
  }

  async function handleChangeRole(member: OrgMember, newRole: "admin" | "member") {
    setMessage(null);
    const { error } = await supabase.rpc("update_org_member_role", { p_member_id: member.id, p_new_role: newRole });
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMembers(members.map((m) => (m.id === member.id ? { ...m, role: newRole } : m)));
      setMessage({ type: "success", text: `Role changed to ${newRole}` });
    }
  }

  async function handleSearch(query: string) {
    setAddEmail(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const { data: results } = await supabase.rpc("search_org_candidates", { p_query: query, p_org_id: orgId });
    if (results) setSearchResults(results as { user_id: string; display_name: string; email: string }[]);
    setSearching(false);
  }

  async function handleAddMember(userId: string, email: string) {
    if (members.some((m) => m.user_id === userId)) {
      setMessage({ type: "error", text: "This user is already a member" });
      return;
    }
    setAdding(true);
    setMessage(null);
    const { data, error } = await supabase
      .from("org_members")
      .insert({ org_id: orgId, user_id: userId, role: addRole })
      .select()
      .single();
    if (error) {
      setMessage({ type: "error", text: error.message });
    } else if (data) {
      const enriched: OrgMember = { ...data, display_name: "", email };
      setMembers([...members, enriched]);
      setAddEmail("");
      setSearchResults([]);
      setMessage({ type: "success", text: `Added ${email} as ${addRole}` });
      onOrgUpdated(orgId, nameInput.trim() || orgName);
    }
    setAdding(false);
  }

  const canManage = currentUserRole === "owner" || currentUserRole === "admin";

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm ${open ? "" : "hidden"}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Organization Settings</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors dark:text-slate-500 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {message && (
            <div className={`px-4 py-3 rounded-lg text-sm font-medium flex items-center justify-between ${
              message.type === "error"
                ? "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                : "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
            }`}>
              <span>{message.text}</span>
              <button onClick={() => setMessage(null)} className="ml-3 text-current opacity-60 hover:opacity-100">x</button>
            </div>
          )}

          {/* Org Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Organization Name</label>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") void handleSaveName(); if (e.key === "Escape") { setNameInput(orgName); setEditingName(false); }}}
                />
                <Button size="sm" onClick={() => void handleSaveName()} disabled={saving}>
                  <Save size={14} />
                  {saving ? "..." : "Save"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setNameInput(orgName); setEditingName(false); }}>Cancel</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{orgName}</span>
                {canManage && (
                  <button onClick={() => setEditingName(true)} className="text-xs text-accent hover:text-accent/80 dark:text-indigo-400">
                    Edit
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Members */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Members ({members.length})</h4>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No members yet</p>
            ) : (
              <div className="space-y-2">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg dark:bg-slate-800">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar email={member.user_id} avatarUrl={member.avatar_url} name={member.display_name} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {member.display_name || member.email || member.user_id}
                          {member.user_id === currentUserId && <span className="text-slate-400 font-normal"> (you)</span>}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Joined {new Date(member.joined_at).toLocaleDateString()}
                          {member.email && member.display_name ? ` · ${member.email}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {member.role === "owner" ? (
                        <Badge variant="info">Owner</Badge>
                      ) : member.role === "admin" ? (
                        <Badge variant="warning">Admin</Badge>
                      ) : (
                        <Badge>Member</Badge>
                      )}
                      {canManage && member.role !== "owner" && (
                        <div className="relative group">
                          <button className="p-1 rounded text-slate-400 hover:text-slate-600 transition-colors dark:text-slate-500">
                            <UserCog size={14} />
                          </button>
                          <div className="absolute right-0 top-7 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-20 min-w-[130px] hidden group-hover:block">
                            {member.role === "admin" ? (
                              <button
                                onClick={() => void handleChangeRole(member, "member")}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                              >
                                <Shield size={12} />
                                Demote to Member
                              </button>
                            ) : (
                              <button
                                onClick={() => void handleChangeRole(member, "admin")}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                              >
                                <ShieldAlert size={12} />
                                Promote to Admin
                              </button>
                            )}
                            <button
                              onClick={() => void handleRemoveMember(member.id, member.user_id)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                            >
                              <UserMinus size={12} />
                              {member.user_id === currentUserId ? "Leave" : "Remove"}
                            </button>
                          </div>
                        </div>
                      )}
                      {canManage && member.user_id === currentUserId && member.role !== "owner" && (
                        <button
                          onClick={() => void handleRemoveMember(member.id, member.user_id)}
                          className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"
                          title="Leave organization"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Member */}
          {canManage && (
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                <UserCog size={12} className="inline mr-1" />
                Add Member
              </h4>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={addEmail}
                    onChange={(e) => void handleSearch(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                  />
                  {searchResults.length > 0 && addEmail.length >= 2 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-30 max-h-40 overflow-y-auto">
                      {searchResults.map((r) => (
                        <button
                          key={r.user_id}
                          onClick={() => void handleAddMember(r.user_id, r.email)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          <Avatar email={r.user_id} name={r.display_name} size="xs" />
                          <div className="truncate text-left">
                            <div className="truncate font-medium">{r.display_name || "Unknown"}</div>
                            <div className="text-xs text-slate-400 truncate">{r.email}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as "admin" | "member")}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Search by name or email to find and add users to this organization.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}