"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Avatar from "@/components/ui/Avatar";
import { User, Shield, Camera, Check, Users, ArrowRight } from "lucide-react";

export default function SettingsPage() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"profile" | "account">("profile");
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [orgMembers, setOrgMembers] = useState<{ user_id: string; display_name: string; user_email: string }[]>([]);
  const [switching, setSwitching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setUser({ id: user.id, email: user.email || "" });

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("display_name, avatar_url")
        .eq("user_id", user.id)
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
          if (profiles) setOrgMembers(profiles);
        }
      }

      setLoading(false);
    }
    void load();
  }, [supabase, router]);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
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

    setUploading(true);
    setMessage("");

    const fileExt = file.name.split(".").pop();
    const filePath = `${user.id}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      setMessage("Failed to upload image. Make sure the avatars bucket exists.");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({ avatar_url: publicUrl })
      .eq("user_id", user.id);

    if (updateError) {
      setMessage("Image uploaded but failed to save profile.");
    } else {
      setAvatarUrl(publicUrl);
      setMessage("Avatar updated!");
    }
    setUploading(false);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("user_profiles")
      .upsert({ user_id: user.id, display_name: displayName.trim() || null }, { onConflict: "user_id" });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Profile updated!");
    }
    setSaving(false);
  }

  async function handleUpdateEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setSaving(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({ email: newEmail });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Check your email for a confirmation link.");
      setNewEmail("");
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
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleAvatarUpload(e)}
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
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving..." : <><Check size={14} /> Save</>}
              </Button>
            </form>
          </div>

          {/* Update Email */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Update Email</h3>
            <form onSubmit={(e) => void handleUpdateEmail(e)} className="flex gap-2">
              <Input
                type="email"
                placeholder="new@email.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving..." : "Update"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {tab === "account" && (
        <div className="space-y-4">
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
    </div>
  );
}
