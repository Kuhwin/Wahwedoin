"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "wahwedoin-timezone";
const DEFAULT_TZ = "America/Barbados";

const COMMON_TZS = [
  "America/Barbados",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

function readStored(): string {
  if (typeof window === "undefined") return DEFAULT_TZ;
  return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_TZ;
}

function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

export function useTimezone() {
  const [timezone, setTimezoneState] = useState<string>(DEFAULT_TZ);
  const supabase = createClient();

  useEffect(() => {
    const stored = readStored();
    setTimezoneState(stored);

    let cancelled = false;
    async function loadFromDb() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from("user_profiles")
        .select("timezone")
        .eq("user_id", user.id)
        .single();
      if (data?.timezone && !cancelled) {
        setTimezoneState(data.timezone);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, data.timezone);
        }
      } else if (!cancelled && !stored.match(/^[A-Z]/)) {
        const detected = getUserTimezone();
        setTimezoneState(detected);
      }
    }
    void loadFromDb();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const setTimezone = useCallback(
    async (next: string) => {
      setTimezoneState(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("user_profiles")
        .upsert(
          { user_id: user.id, timezone: next, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
    },
    [supabase],
  );

  function nowInTz(): Date {
    return new Date();
  }

  function todayInTz(tz: string = timezone): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  function addDaysInTz(dateStr: string, days: number, tz: string = timezone): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    const refUtc = Date.UTC(y, m - 1, d);
    const refDate = new Date(refUtc);
    for (let i = 0; i < days; i++) refDate.setUTCDate(refDate.getUTCDate() + 1);
    const out = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(refDate);
    return out;
  }

  return {
    timezone,
    setTimezone,
    commonTimezones: COMMON_TZS,
    detectedTimezone: getUserTimezone(),
    nowInTz,
    todayInTz,
    addDaysInTz,
  };
}
