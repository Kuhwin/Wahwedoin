"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Avatar from "@/components/ui/Avatar";
import { User, Shield, Palette } from "lucide-react";

export default function SettingsPage() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"profile" | "account">("profile");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
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
      setLoading(false);
    }
    void load();
  }, [supabase, router]);

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
      setCurrentPassword("");
    }
    setSaving(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your account settings</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => setTab("profile")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "profile" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <User size={14} className="inline mr-2" />
          Profile
        </button>
        <button
          onClick={() => setTab("account")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "account" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Shield size={14} className="inline mr-2" />
          Account
        </button>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-sm text-indigo-700 mb-4">
          {message}
        </div>
      )}

      {tab === "profile" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-4">
            <Avatar email={user.email} size="lg" />
            <div>
              <p className="font-medium text-slate-900">{user.email}</p>
              <p className="text-sm text-slate-500">User ID: {user.id.slice(0, 8)}...</p>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Update Email</h3>
            <form onSubmit={handleUpdateEmail} className="flex gap-2">
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
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Change Password</h3>
            <form onSubmit={handleUpdatePassword} className="space-y-3">
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

          <div className="bg-white border border-red-200 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-red-700 mb-2">Danger Zone</h3>
            <p className="text-sm text-slate-500 mb-4">Sign out of your account on this device.</p>
            <Button variant="danger" size="sm" onClick={handleSignOut}>
              Sign Out
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
