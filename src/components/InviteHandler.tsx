"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";

export default function InviteHandler() {
  const { addToast } = useToast();
  const supabase = createClient();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    async function checkInvites() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data: invites } = await supabase
        .from("team_invites")
        .select("id, team_id, role, email, teams(name)")
        .eq("email", user.email)
        .eq("status", "pending");

      if (!invites || invites.length === 0) return;

      let joined = 0;
      let firstTeamName: string | undefined;
      for (const invite of invites) {
        const { error: memberErr } = await supabase.from("team_members").upsert(
          {
            team_id: invite.team_id,
            user_id: user.id,
            role: invite.role,
            joined_at: new Date().toISOString(),
          },
          { onConflict: "team_id,user_id" },
        );

        if (!memberErr) {
          joined++;
          if (!firstTeamName) {
            firstTeamName = (invite as unknown as { teams?: { name?: string } }).teams?.name;
          }
          await supabase
            .from("team_invites")
            .update({ status: "accepted" })
            .eq("id", invite.id);
        }
      }

      if (joined > 0) {
        const teamLabel = firstTeamName ? ` to ${firstTeamName}` : "";
        addToast(
          joined === 1
            ? `You've been added${teamLabel}!`
            : `You've been added to ${joined} teams!`,
          "success",
        );
      }
    }

    void checkInvites();
  }, [supabase, addToast]);

  return null;
}
