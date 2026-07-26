"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

interface ActiveUserProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  accent_colour: string | null;
  user_email: string;
}

interface ActiveUserContextType {
  authUserId: string | null;
  activeUserId: string | null;
  activeProfile: ActiveUserProfile | null;
  orgMembers: ActiveUserProfile[];
  isImpersonating: boolean;
  switchUser: (userId: string) => void;
}

const ActiveUserContext = createContext<ActiveUserContextType>({
  authUserId: null,
  activeUserId: null,
  activeProfile: null,
  orgMembers: [],
  isImpersonating: false,
  switchUser: () => {},
});

export function useActiveUser() {
  return useContext(ActiveUserContext);
}

export function ActiveUserProvider({ children }: { children: ReactNode }) {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<ActiveUserProfile | null>(null);
  const [orgMembers, setOrgMembers] = useState<ActiveUserProfile[]>([]);
  const supabase = createClient();

  const loadProfiles = useCallback(async (authId: string) => {
    const { data: authProfile } = await supabase
      .from("user_profiles")
      .select("user_id, display_name, avatar_url, accent_colour")
      .eq("user_id", authId)
      .single();

    const { data: teamData } = await supabase
      .from("team_members")
      .select("user_id");

    if (!teamData || teamData.length === 0) {
      const profile: ActiveUserProfile = {
        user_id: authId,
        display_name: authProfile?.display_name || null,
        avatar_url: authProfile?.avatar_url || null,
        accent_colour: authProfile?.accent_colour || null,
        user_email: "",
      };
      setActiveProfile(profile);
      setOrgMembers([profile]);
      return;
    }

    const uniqueIds = [...new Set(teamData.map((m: { user_id: string }) => m.user_id))] as string[];
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, display_name, avatar_url, accent_colour")
      .in("user_id", uniqueIds);

    const { data: authData } = await supabase.auth.getUser();
    const userEmail = authData.user?.email || "";

    const members: ActiveUserProfile[] = uniqueIds.map((uid: string) => {
      const prof = profiles?.find((p: { user_id: string }) => p.user_id === uid);
      return {
        user_id: uid,
        display_name: prof?.display_name || null,
        avatar_url: prof?.avatar_url || null,
        accent_colour: prof?.accent_colour || null,
        user_email: uid === authId ? userEmail : "",
      };
    });

    setOrgMembers(members);

    const stored = localStorage.getItem("wahwedoin-active-user");
    const targetId = stored && uniqueIds.includes(stored) ? stored : authId;

    setActiveUserId(targetId);
    const prof = members.find((m) => m.user_id === targetId);
    if (prof) setActiveProfile(prof);
  }, [supabase]);

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setAuthUserId(data.user.id);
        await loadProfiles(data.user.id);
      }
    }
    void init();
  }, [supabase, loadProfiles]);

  function switchUser(userId: string) {
    localStorage.setItem("wahwedoin-active-user", userId);
    setActiveUserId(userId);
    const prof = orgMembers.find((m) => m.user_id === userId);
    if (prof) setActiveProfile(prof);
  }

  return (
    <ActiveUserContext.Provider
      value={{
        authUserId,
        activeUserId,
        activeProfile,
        orgMembers,
        isImpersonating: activeUserId !== null && activeUserId !== authUserId,
        switchUser,
      }}
    >
      {children}
    </ActiveUserContext.Provider>
  );
}
