"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface NotificationsCountContextValue {
  unreadCount: number;
  refresh: () => void;
}

const NotificationsCountContext = createContext<NotificationsCountContextValue>({
  unreadCount: 0,
  refresh: () => {},
});

export function useNotificationsCount() {
  return useContext(NotificationsCountContext);
}

export function NotificationsCountProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();
  const [refreshTick, setRefreshTick] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setUserId(user.id);

      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);

      if (!cancelled && typeof count === "number") setUnreadCount(count);

      const channel = supabase
        .channel(`unread-count-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          () => {
            if (!cancelled) setUnreadCount((c) => c + 1);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          () => {
            if (!cancelled) {
              void supabase
                .from("notifications")
                .select("*", { count: "exact", head: true })
                .eq("user_id", user.id)
                .eq("read", false)
                .then(({ count }: { count: number | null }) => {
                  if (!cancelled && typeof count === "number") setUnreadCount(count);
                });
            }
          },
        )
        .subscribe();

      channelRef.current = channel;
    }
    void load();
    return () => {
      cancelled = true;
      channelRef.current?.unsubscribe();
      channelRef.current = undefined;
    };
  }, [supabase, refreshTick]);

  useEffect(() => {
    if (!userId) return;
    const handler = () => setRefreshTick((n) => n + 1);
    window.addEventListener("notifications:changed", handler);
    return () => window.removeEventListener("notifications:changed", handler);
  }, [userId]);

  return (
    <NotificationsCountContext.Provider
      value={{ unreadCount, refresh: () => setRefreshTick((n) => n + 1) }}
    >
      {children}
    </NotificationsCountContext.Provider>
  );
}
