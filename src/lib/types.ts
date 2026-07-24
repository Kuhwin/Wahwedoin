export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Team {
  id: string;
  org_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  parent_team_id: string | null;
  created_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  joined_at: string;
  user_email?: string;
  user_name?: string;
}

export interface Project {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  status: "active" | "archived" | "completed";
  created_by: string | null;
  created_at: string;
  updated_at: string;
  task_count?: number;
  completed_count?: number;
}

export interface Section {
  id: string;
  project_id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  assignee_id: string | null;
  section_id: string | null;
  due_date: string | null;
  position: number;
  parent_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assignee_email?: string;
  assignee_name?: string;
}

export interface Tag {
  id: string;
  team_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

export interface Event {
  id: string;
  team_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  all_day: boolean;
  color: string;
  created_by: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  team_id: string | null;
  project_id: string | null;
  user_id: string;
  action: string;
  detail: string | null;
  created_at: string;
  user_email?: string;
}

export type ViewMode = "board" | "list" | "calendar";

export interface TeamInvite {
  id: string;
  team_id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  invited_by: string | null;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  expires_at: string;
}

export interface CalendarLink {
  id: string;
  user_id: string;
  team_id: string;
  label: string;
  ical_url: string;
  color: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: string;
  read: boolean;
  link: string | null;
  created_at: string;
}

export interface TeamDoc {
  id: string;
  team_id: string;
  title: string;
  content: string;
  category: "meeting_notes" | "sop" | "project_brief" | "general";
  pinned: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  author_name?: string;
}

export interface TeamMeeting {
  id: string;
  team_id: string;
  name: string;
  day_of_week: number | null;
  time: string | null;
  duration_minutes: number;
  meet_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TeamLink {
  id: string;
  team_id: string;
  name: string;
  url: string;
  category: "drive" | "repo" | "design" | "reference" | "tool" | "other";
  added_by: string | null;
  created_at: string;
  added_by_name?: string;
}

export const PRIORITY_CONFIG = {
  low: { label: "Low", color: "bg-slate-100 text-slate-600" },
  medium: { label: "Medium", color: "bg-blue-100 text-blue-600" },
  high: { label: "High", color: "bg-orange-100 text-orange-600" },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-600" },
} as const;

export const STATUS_CONFIG = {
  todo: { label: "To Do", color: "bg-slate-100 text-slate-600" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-600" },
  done: { label: "Done", color: "bg-green-100 text-green-600" },
} as const;

export const TEAM_ROLES = {
  owner: { label: "Owner", description: "Full control" },
  admin: { label: "Admin", description: "Can manage members and settings" },
  member: { label: "Member", description: "Can edit tasks and projects" },
  viewer: { label: "Viewer", description: "Read-only access" },
} as const;

export const PROJECT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#64748b", "#78716c",
] as const;
