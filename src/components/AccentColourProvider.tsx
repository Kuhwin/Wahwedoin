"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActiveUser } from "@/components/ActiveUserProvider";

const ACCENT_PRESETS = [
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#64748b",
];

interface AccentColourContextType {
  accent: string;
  setAccent: (colour: string) => void;
  presets: string[];
}

const AccentColourContext = createContext<AccentColourContextType>({
  accent: "#6366f1",
  setAccent: () => {},
  presets: ACCENT_PRESETS,
});

export function useAccentColour() {
  return useContext(AccentColourContext);
}

export function AccentColourProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState("#6366f1");
  const { activeUserId } = useActiveUser();
  const supabase = createClient();

  useEffect(() => {
    if (!activeUserId) return;
    let cancelled = false;
    supabase
      .from("user_profiles")
      .select("accent_colour")
      .eq("user_id", activeUserId)
      .single()
      .then(({ data }: { data: { accent_colour?: string | null } | null }) => {
        if (!cancelled && data?.accent_colour) setAccentState(data.accent_colour);
      });
    return () => { cancelled = true; };
  }, [activeUserId, supabase]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
    const r = parseInt(accent.slice(1, 3), 16);
    const g = parseInt(accent.slice(3, 5), 16);
    const b = parseInt(accent.slice(5, 7), 16);
    document.documentElement.style.setProperty("--accent-rgb", `${r},${g},${b}`);
  }, [accent]);

  const setAccent = useCallback((colour: string) => {
    setAccentState(colour);
    if (activeUserId) {
      supabase
        .from("user_profiles")
        .update({ accent_colour: colour, updated_at: new Date().toISOString() })
        .eq("user_id", activeUserId);
    }
  }, [activeUserId, supabase]);

  return (
    <AccentColourContext.Provider value={{ accent, setAccent, presets: ACCENT_PRESETS }}>
      {children}
    </AccentColourContext.Provider>
  );
}
