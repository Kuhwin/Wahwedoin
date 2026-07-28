"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Avatar from "@/components/ui/Avatar";
import { User, Shield, Camera, Users, ArrowRight, Link2, Unlink, Mail, Calendar, FileText, RefreshCw, Bell, Palette, Upload, Globe } from "lucide-react";
import type { LinkedGoogleAccount } from "@/lib/types";
import ImportWizard from "@/components/ImportWizard";
import ImageCropper from "@/components/ImageCropper";
import { useTheme } from "@/components/ui/ThemeProvider";
import { useAccentColour } from "@/components/AccentColourProvider";
import { useTimezone } from "@/lib/useTimezone";
import { Sun, Moon } from "lucide-react";

export default function SettingsPage() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"profile" | "account" | "notifications" | "appearance" | "import">("profile");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [orgMembers, setOrgMembers] = useState<{ user_id: string; display_name: string; user_email: string }[]>([]);
  const [switching, setSwitching] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedGoogleAccount[]>([]);
  const [linkingLoading, setLinkingLoading] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState({
    task_assigned: true,
    task_due_soon: true,
    task_commented: true,
    team_invite: true,
    email_digest: "off" as "off" | "daily" | "weekly",
  });
  const [savingNotifs, setSavingNotifs] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    const linked = searchParams.get("linked");
    const errorParam = searchParams.get("error");
    if (linked === "success") {
      setMessage("Google account linked successfully!");
      window.history.replaceState({}, "", "/settings?tab=account");
    }
    if (errorParam) {
      setMessage(`Failed to link account: ${errorParam}`);
      window.history.replaceState({}, "", "/settings?tab=account");
    }
  }, [searchParams]);

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push("/auth/login");
        return;
      }
      setUser({ id: authUser.id, email: authUser.email || "" });

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("display_name, avatar_url")
        .eq("user_id", authUser.id)
        .single();

      if (profile) {
        setDisplayName(profile.display_name || "");
        setAvatarUrl(profile.avatar_url || null);
      }

      const { data: teamData } = await supabase
        .from("team_members")
        .select("user_id");
      if (teamData) {
        const uniqueIds = [...new Set(teamData.map((m: { user_id: string }) => m.user_id))];
        if (uniqueIds.length > 0) {
          const { data: profiles } = await supabase
            .from("user_profiles")
            .select("user_id, display_name, user_email")
            .in("user_id", uniqueIds);
          if (profiles) setOrgMembers(profiles as { user_id: string; display_name: string; user_email: string }[]);
        }
      }

      const { data: accounts } = await supabase
        .from("user_google_accounts")
        .select("id, email, display_name, avatar_url, scope, created_at, color, display_label")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });
      if (accounts) setLinkedAccounts(accounts as LinkedGoogleAccount[]);

      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", authUser.id)
        .single();
      if (prefs) {
        setNotifPrefs({
          task_assigned: prefs.task_assigned ?? true,
          task_due_soon: prefs.task_due_soon ?? true,
          task_commented: prefs.task_commented ?? true,
          team_invite: prefs.team_invite ?? true,
          email_digest: prefs.email_digest ?? "off",
        });
      }

      setLoading(false);
    }
    void load();
  }, [supabase, router]);

  const [avatarCropSrc, setAvatarCropSrc] = useState<string | null>(null);

  async function handleAvatarUpload(blob: Blob) {
    if (!user) return;
    setUploading(true);
    setMessage("");

    const ext = blob.type === "image/jpeg" ? "jpg" : "png";
    const filePath = `${user.id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, blob, { upsert: true, contentType: blob.type || "image/png" });

    if (uploadError) {
      console.error("[avatar] upload failed", uploadError);
      setMessage("Upload failed: " + uploadError.message);
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);

    const { data, error: upsertErr } = await supabase.from("user_profiles").upsert(
      { user_id: user.id, avatar_url: publicUrl, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    ).select("avatar_url").single();

    if (upsertErr) {
      console.error("[avatar] profile upsert failed", upsertErr);
      setMessage("Failed to save: " + upsertErr.message);
      setUploading(false);
      return;
    }

    setAvatarUrl(data?.avatar_url || publicUrl);
    setUploading(false);
    setMessage("Profile photo updated.");
  }

  function handleAvatarFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage("Image must be under 2MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setMessage("File must be an image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || !user) return;
    setSaving(true);
    setMessage("");

    const { error } = await supabase.from("user_profiles").upsert(
      { user_id: user.id, display_name: displayName.trim(), updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

    if (error) {
      setMessage("Failed to save: " + error.message);
    } else {
      setMessage("Profile updated.");
    }
    setSaving(false);
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword.trim()) return;
    setSaving(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Password updated successfully.");
      setNewPassword("");
    }
    setSaving(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  async function handleSwitchUser(targetEmail: string) {
    setSwitching(true);
    await supabase.auth.signOut();
    router.push(`/auth/login?email=${encodeURIComponent(targetEmail)}`);
  }

  function handleLinkGoogle() {
    if (!user) return;
    setLinkingLoading(true);
    window.location.href = `/api/auth/google/link?user_id=${user.id}`;
  }

  async function handleUnlinkAccount(accountId: string) {
    const { error } = await supabase.from("user_google_accounts").delete().eq("id", accountId);
    if (!error) {
      setLinkedAccounts(linkedAccounts.filter((a) => a.id !== accountId));
      setMessage("Account disconnected.");
    }
  }

  async function handleSaveNotifs() {
    if (!user) return;
    setSavingNotifs(true);
    const { error } = await supabase.from("notification_preferences").upsert(
      { user_id: user.id, ...notifPrefs, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    if (!error) setMessage("Notification preferences saved.");
    setSavingNotifs(false);
  }

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage your account settings</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => setTab("profile")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "profile" ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <User size={14} className="inline mr-2" />
          Profile
        </button>
        <button
          onClick={() => setTab("account")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "account" ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <Shield size={14} className="inline mr-2" />
          Account
        </button>
        <button
          onClick={() => setTab("notifications")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "notifications" ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <Bell size={14} className="inline mr-2" />
          Notifications
        </button>
        <button
          onClick={() => setTab("appearance")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "appearance" ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <Palette size={14} className="inline mr-2" />
          Appearance
        </button>
        <button
          onClick={() => setTab("import")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "import" ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <Upload size={14} className="inline mr-2" />
          Import
        </button>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm mb-4 ${
          message.includes("Failed") || message.includes("error")
            ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
            : "bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400"
        }`}>
          {message}
        </div>
      )}

      {tab === "profile" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Avatar email={user.email} avatarUrl={avatarUrl} size="lg" />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Camera size={18} className="text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarFileSelect}
              />
            </div>
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">{user.email}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Click avatar to upload a photo</p>
            </div>
          </div>

          {/* Display Name */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Display Name</h3>
            <form onSubmit={(e) => void handleSaveProfile(e)} className="flex gap-2">
              <Input
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" size="sm" disabled={saving || !displayName.trim()}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {tab === "account" && (
        <div className="space-y-4">
          {/* Connected Google Accounts */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Link2 size={16} className="text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Connected Google Accounts</h3>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Connect multiple Google accounts to pull calendar, drive, docs, and email from each into one view.
            </p>

            {linkedAccounts.length > 0 && (
              <div className="space-y-2 mb-4">
                {linkedAccounts.map((account) => (
                  <div key={account.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: account.color || "#6366f1" }}>
                      {(account.display_name || account.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          defaultValue={account.display_label || account.display_name || account.email.split("@")[0]}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val !== (account.display_label || account.display_name || account.email.split("@")[0])) {
                              void supabase.from("user_google_accounts").update({ display_label: val }).eq("id", account.id);
                              setLinkedAccounts(linkedAccounts.map((a) => a.id === account.id ? { ...a, display_label: val } : a));
                            }
                          }}
                          className="text-sm font-medium text-slate-700 dark:text-slate-300 bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 focus:outline-none transition-colors px-0 py-0 w-full max-w-[160px]"
                          placeholder="Label (e.g. Work, Personal)"
                        />
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{account.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        defaultValue={account.color || "#6366f1"}
                        onChange={(e) => {
                          const color = e.target.value;
                          void supabase.from("user_google_accounts").update({ color }).eq("id", account.id);
                          setLinkedAccounts(linkedAccounts.map((a) => a.id === account.id ? { ...a, color } : a));
                        }}
                        className="w-6 h-6 rounded-full border-0 cursor-pointer p-0 bg-transparent"
                        title="Change account colour"
                      />
                      <div className="flex items-center gap-1.5">
                        {account.scope.includes("calendar") && (
                          <span title="Calendar" className="p-1 text-blue-500"><Calendar size={12} /></span>
                        )}
                        {account.scope.includes("drive") && (
                          <span title="Drive" className="p-1 text-green-500"><FileText size={12} /></span>
                        )}
                        {account.scope.includes("gmail") && (
                          <span title="Gmail" className="p-1 text-red-500"><Mail size={12} /></span>
                        )}
                      </div>
                      <button
                        onClick={() => void handleUnlinkAccount(account.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Disconnect account"
                      >
                        <Unlink size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={handleLinkGoogle}
              disabled={linkingLoading}
            >
              {linkingLoading ? (
                <>
                  <RefreshCw size={14} className="mr-1 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Link2 size={14} className="mr-1" />
                  Connect Google Account
                </>
              )}
            </Button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Change Password</h3>
            <form onSubmit={(e) => void handleUpdatePassword(e)} className="space-y-3">
              <Input
                label="New Password"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving..." : "Update Password"}
              </Button>
            </form>
          </div>

          {orgMembers.length > 1 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-2">
                <Users size={16} className="text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Switch User</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Sign in as another team member. You&apos;ll be logged out and a magic link will be sent to their email.</p>
              <div className="space-y-2">
                {orgMembers.filter((m) => m.user_id !== user.id).map((member) => (
                  <button
                    key={member.user_id}
                    onClick={() => void handleSwitchUser(member.user_email)}
                    disabled={switching}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group"
                  >
                    <Avatar name={member.display_name} email={member.user_email} size="sm" />
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{member.display_name || "Unknown"}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{member.user_email}</p>
                    </div>
                    <ArrowRight size={14} className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">Danger Zone</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Sign out of your account on this device.</p>
            <Button variant="danger" size="sm" onClick={() => void handleSignOut()}>
              Sign Out
            </Button>
          </div>
        </div>
      )}

      {tab === "notifications" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-6">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Notification Preferences</h3>

          <div className="space-y-4">
            {[
              { key: "task_assigned" as const, label: "Task assigned to me", desc: "When someone assigns you a task" },
              { key: "task_due_soon" as const, label: "Task due soon", desc: "Reminders for tasks due today or tomorrow" },
              { key: "task_commented" as const, label: "Task comments", desc: "When someone comments on a task you're involved in" },
              { key: "team_invite" as const, label: "Team invites", desc: "When someone invites you to a team" },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                </div>
                <button
                  onClick={() => setNotifPrefs({ ...notifPrefs, [item.key]: !notifPrefs[item.key] })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    notifPrefs[item.key] ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      notifPrefs[item.key] ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            ))}

            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Email Digest</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Receive a summary of activity by email</p>
                </div>
                <select
                  value={notifPrefs.email_digest}
                  onChange={(e) => setNotifPrefs({ ...notifPrefs, email_digest: e.target.value as "off" | "daily" | "weekly" })}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="off">Off</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => void handleSaveNotifs()} disabled={savingNotifs}>
              {savingNotifs ? "Saving..." : "Save Preferences"}
            </Button>
          </div>
        </div>
      )}

      {tab === "appearance" && (
        <AppearanceTab />
      )}

      {tab === "import" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
          <ImportWizard />
        </div>
      )}

      {avatarCropSrc && (
        <ImageCropper
          open={!!avatarCropSrc}
          imageSrc={avatarCropSrc}
          aspectRatio={1}
          onClose={() => setAvatarCropSrc(null)}
          onConfirm={handleAvatarUpload}
          title="Crop your profile photo"
        />
      )}
    </div>
  );
}

function AppearanceTab() {
  const { theme, toggleTheme } = useTheme();
  const { accent, setAccent, presets } = useAccentColour();
  const { timezone, setTimezone, commonTimezones, detectedTimezone } = useTimezone();
  const [savingTz, setSavingTz] = useState(false);
  const [tzMessage, setTzMessage] = useState("");

  async function handleSetTimezone(next: string) {
    if (next === timezone) return;
    setSavingTz(true);
    setTzMessage("");
    try {
      await setTimezone(next);
      setTzMessage("Saved");
      setTimeout(() => setTzMessage(""), 1500);
    } catch {
      setTzMessage("Failed to save");
    } finally {
      setSavingTz(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          {theme === "dark" ? <Moon size={20} className="text-indigo-500" /> : <Sun size={20} className="text-amber-500" />}
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Theme</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Switch between light and dark mode</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { if (theme === "dark") toggleTheme(); }}
            className={`flex-1 p-4 rounded-xl border-2 transition-all ${
              theme === "light"
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
            }`}
          >
            <Sun size={24} className="mx-auto mb-2 text-amber-500" />
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Light</p>
          </button>
          <button
            onClick={() => { if (theme === "light") toggleTheme(); }}
            className={`flex-1 p-4 rounded-xl border-2 transition-all ${
              theme === "dark"
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
            }`}
          >
            <Moon size={24} className="mx-auto mb-2 text-indigo-400" />
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Dark</p>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Palette size={20} style={{ color: accent }} />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Accent Colour</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Your personal colour — shows on buttons, nav, and avatars</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {presets.map((c) => (
            <button
              key={c}
              onClick={() => setAccent(c)}
              className={`w-10 h-10 rounded-full border-3 transition-all ${
                accent === c ? "border-slate-900 dark:border-white scale-110 ring-2 ring-offset-2 ring-slate-300 dark:ring-offset-slate-800" : "border-transparent hover:scale-110"
              }`}
              style={{ backgroundColor: c, borderWidth: "3px" }}
            />
          ))}
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3">
          This colour is personal to you — teammates won&apos;t see it
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Globe size={20} className="text-indigo-500" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Timezone</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Affects due dates, recurring events, and Google Calendar sync</p>
          </div>
        </div>
        <select
          value={timezone}
          onChange={(e) => void handleSetTimezone(e.target.value)}
          disabled={savingTz}
          className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {commonTimezones.includes(timezone) ? null : (
            <option value={timezone}>{timezone}</option>
          )}
          {commonTimezones.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
        {detectedTimezone && detectedTimezone !== timezone && (
          <button
            onClick={() => void handleSetTimezone(detectedTimezone)}
            className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Use detected timezone: {detectedTimezone}
          </button>
        )}
        {tzMessage && (
          <p className="text-[11px] text-green-600 dark:text-green-400 mt-2">{tzMessage}</p>
        )}
      </div>
    </div>
  );
}
