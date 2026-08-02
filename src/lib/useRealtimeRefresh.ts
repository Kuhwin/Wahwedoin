"use client";

import { useEffect } from "react";
import { useSWRConfig } from "swr";
import { createClient } from "@/lib/supabase/client";

export type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

interface UseRealtimeRefreshOptions {
  tables: string[];
  swrKeys: (string | null | undefined)[];
  event?: RealtimeEvent;
}

export function useRealtimeRefresh({ tables, swrKeys, event = "*" }: UseRealtimeRefreshOptions) {
  const { mutate } = useSWRConfig();
  const tablesKey = tables.join(",");
  const keysKey = swrKeys.join(",");

  useEffect(() => {
    const validKeys = swrKeys.filter((k): k is string => !!k);
    if (tables.length === 0 || validKeys.length === 0) return;

    const supabase = createClient();
    const channel = supabase.channel(`page-realtime-${crypto.randomUUID()}`);
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event, schema: "public", table },
        () => {
          validKeys.forEach((k) => void mutate(k));
        },
      );
    }
    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutate, tablesKey, keysKey, event]);
}
