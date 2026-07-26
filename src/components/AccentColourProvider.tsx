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
  "#15803d",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#92400e",
  "#78350f",
  "#0f766e",
  "#64748b",
];

const STORAGE_KEY = "wahwedoin-accent";

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

function applyAccent(colour: string) {
  document.documentElement.style.setProperty("--accent", colour);
  const r = parseInt(colour.slice(1, 3), 16);
  const g = parseInt(colour.slice(3, 5), 16);
  const b = parseInt(colour.slice(5, 7), 16);
  document.documentElement.style.setProperty("--accent-rgb", `${r},${g},${b}`);
}

export function AccentColourProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) || "#6366f1";
    }
    return "#6366f1";
  });
  const { activeUserId } = useActiveUser();
  const supabase = createClient();

  useEffect(() => {
    applyAccent(accent);
  }, [accent]);

  useEffect(() => {
    if (!activeUserId) return;
    let cancelled = false;
    supabase
      .from("user_profiles")
      .select("accent_colour")
      .eq("user_id", activeUserId)
      .single()
      .then(({ data, error }: { data: { accent_colour?: string | null } | null; error: unknown }) => {
        if (cancelled) return;
        if (error) return;
        if (data?.accent_colour) {
          setAccentState(data.accent_colour);
          localStorage.setItem(STORAGE_KEY, data.accent_colour);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeUserId, supabase]);

  const setAccent = useCallback((colour: string) => {
    setAccentState(colour);
    localStorage.setItem(STORAGE_KEY, colour);
    if (activeUserId) {
      supabase
        .from("user_profiles")
        .update({ accent_colour: colour, updated_at: new Date().toISOString() })
        .eq("user_id", activeUserId)
        .then(() => {})
        .catch(() => {});
    }
  }, [activeUserId, supabase]);

  return (
    <AccentColourContext.Provider value={{ accent, setAccent, presets: ACCENT_PRESETS }}>
      {children}
    </AccentColourContext.Provider>
  );
}
