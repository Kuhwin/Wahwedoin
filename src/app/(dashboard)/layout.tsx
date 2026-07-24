"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import type { User } from "@supabase/supabase-js";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showNameEntry, setShowNameEntry] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setUser(user);

      // Check if user has a profile
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .single();

      if (!profile || !profile.display_name) {
        // Pre-fill from Google metadata if available
        const googleName = user.user_metadata?.full_name || user.user_metadata?.name || "";
        setProfileName(googleName);
        setShowNameEntry(true);
      }

      setLoading(false);
    }
    void getUser();
  }, [supabase, router]);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) setMobileOpen(false);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profileName.trim() || !user) return;
    setSavingProfile(true);
    setProfileError("");

    const { error } = await supabase.from("user_profiles").upsert(
      {
        user_id: user.id,
        display_name: profileName.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      setProfileError(error.message || "Failed to save profile.");
      setSavingProfile(false);
      return;
    }

    setShowNameEntry(false);
    setSavingProfile(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        user={user!}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className={`transition-all duration-200 ${expanded ? "md:ml-64" : "md:ml-16"}`}>
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="p-4 md:p-6 pb-20 md:pb-6">{children}</main>
      </div>
      <MobileNav />

      {/* Name Entry Modal (after Google OAuth) */}
      {showNameEntry && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
            <div className="text-center mb-6">
              <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold text-lg">WD</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900">What should we call you?</h2>
              <p className="text-sm text-slate-500 mt-1">
                Enter your name so your teammates can find you
              </p>
            </div>
            <form onSubmit={(e) => void handleSaveProfile(e)} className="space-y-4">
              {profileError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {profileError}
                </div>
              )}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">Full Name</label>
                <input
                  autoFocus
                  type="text"
                  placeholder="First and last name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">Spaces and special characters are allowed</p>
              </div>
              <button
                type="submit"
                disabled={savingProfile || !profileName.trim()}
                className="w-full px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {savingProfile ? "Saving..." : "Continue"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
