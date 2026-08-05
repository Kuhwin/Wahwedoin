"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Users, FileText, Calendar, Link2, LayoutGrid, UserPlus, FolderOpen } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import DriveLinkPanel from "@/components/DriveLinkPanel";
import TeamOverview from "@/components/team/TeamOverview";
import TeamDocs from "@/components/team/TeamDocs";
import TeamMeetings from "@/components/team/TeamMeetings";
import TeamLinks from "@/components/team/TeamLinks";
import TeamBoard from "@/components/team/TeamBoard";
import { type Team, type TeamMember } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "overview" | "docs" | "meetings" | "links" | "board" | "drive";

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "overview", label: "Overview", icon: Users },
  { id: "docs", label: "Docs", icon: FileText },
  { id: "meetings", label: "Meetings", icon: Calendar },
  { id: "links", label: "Links", icon: Link2 },
  { id: "drive", label: "Drive", icon: FolderOpen },
  { id: "board", label: "Board", icon: LayoutGrid },
];

export default function TeamWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.teamId as string;
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, string>>({});
  const [memberAvatarUrls, setMemberAvatarUrls] = useState<Record<string, string>>({});
  const [memberEmails, setMemberEmails] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const searchParams = useSearchParams();
  // When the sidebar's per-team "Add Project" link is used, it navigates to
  // /teams/<id>?action=add-project. We force the overview tab and signal
  // TeamOverview to open its create-project modal so the user stays in
  // the team context (and the browser back button returns to the team
  // instead of to the global /projects page).
  const [autoOpenCreate, setAutoOpenCreate] = useState(
    searchParams.get("action") === "add-project"
  );
  useEffect(() => {
    if (searchParams.get("action") === "add-project") {
      setActiveTab("overview");
      setAutoOpenCreate(true);
      // Strip the query param so a subsequent back navigation to this
      // page lands on a clean team URL (no re-opened modal) and the
      // browser back button behaves as expected.
      router.replace(`/teams/${teamId}`);
    }
  }, [searchParams, router, teamId]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const supabase = createClient();

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUser(user.id);

    const { data: teamData } = await supabase
      .from("teams")
      .select("*")
      .eq("id", teamId)
      .single();

    if (!teamData) {
      router.push("/teams");
      return;
    }
    setTeam(teamData);

    const { data: membersData } = await supabase
      .from("team_members")
      .select("*")
      .eq("team_id", teamId);

    if (membersData) {
      setMembers(membersData);
      const myMembership = membersData.find((m: TeamMember) => m.user_id === user?.id);
      setUserRole(myMembership?.role || null);

      // Use get_org_member_profiles (SECURITY DEFINER) to fetch
      // display_name + avatar_url + email for every team member. This
      // bypasses the restrictive user_profiles SELECT RLS and gives us a
      // real email fallback so the UI no longer falls back to a raw UUID.
      if (teamData.org_id) {
        const { data: orgProfiles } = await supabase.rpc("get_org_member_profiles", { p_org_id: teamData.org_id });
        if (orgProfiles) {
          const nameMap: Record<string, string> = {};
          const avatarMap: Record<string, string> = {};
          const emailMap: Record<string, string> = {};
          (orgProfiles as { user_id: string; display_name: string | null; avatar_url: string | null; email: string | null }[]).forEach((p) => {
            if (p.display_name) nameMap[p.user_id] = p.display_name;
            if (p.avatar_url) avatarMap[p.user_id] = p.avatar_url;
            if (p.email) emailMap[p.user_id] = p.email;
          });
          setMemberProfiles(nameMap);
          setMemberAvatarUrls(avatarMap);
          setMemberEmails(emailMap);
        }
      }
    }

    setLoading(false);
  }, [teamId, supabase, router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading || !team) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/teams"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{team.name}</h1>
            {team.description && (
              <p className="text-sm text-slate-500">{team.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center -space-x-2">
            {members.slice(0, 5).map((member) => (
              <Avatar
                key={member.id}
                name={memberProfiles[member.user_id]}
                email={memberEmails[member.user_id] || member.user_id}
                avatarUrl={memberAvatarUrls[member.user_id]}
                size="sm"
                className="ring-2 ring-white"
              />
            ))}
            {members.length > 5 && (
              <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-medium text-slate-600 ring-2 ring-white">
                +{members.length - 5}
              </div>
            )}
          </div>
          {(userRole === "owner" || userRole === "admin") && (
            <Link href="/teams">
              <Button variant="ghost" size="sm">
                <UserPlus size={14} />
                Manage
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 mb-6 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "bg-white dark:bg-accent text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              )}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <TeamOverview
          teamId={teamId}
          members={members}
          memberProfiles={memberProfiles}
          memberAvatarUrls={memberAvatarUrls}
          memberEmails={memberEmails}
          autoOpenCreate={autoOpenCreate}
          onAutoOpenHandled={() => setAutoOpenCreate(false)}
        />
      )}
      {activeTab === "docs" && (
        <TeamDocs teamId={teamId} currentUser={currentUser} userRole={userRole} />
      )}
      {activeTab === "meetings" && (
        <TeamMeetings teamId={teamId} currentUser={currentUser} userRole={userRole} />
      )}
      {activeTab === "links" && (
        <TeamLinks teamId={teamId} currentUser={currentUser} userRole={userRole} />
      )}
      {activeTab === "drive" && (
        <DriveLinkPanel
          tableName="teams"
          recordId={teamId}
          accountId={team.drive_account_id}
          folderId={team.drive_folder_id}
          folderName={team.drive_folder_name}
          onLinked={() => void loadData()}
        />
      )}
      {activeTab === "board" && (
        <TeamBoard teamId={teamId} members={members} memberProfiles={memberProfiles} />
      )}
    </div>
  );
}
