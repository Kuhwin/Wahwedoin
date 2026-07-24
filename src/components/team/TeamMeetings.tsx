"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Calendar, Plus, Trash2, ExternalLink, Clock } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import { type TeamMeeting } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TeamMeetingsProps {
  teamId: string;
  currentUser: string | null;
  userRole: string | null;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getNextOccurrence(meeting: TeamMeeting): Date | null {
  if (meeting.day_of_week === null || !meeting.time) return null;
  const now = new Date();
  const [hours, minutes] = meeting.time.split(":").map(Number);
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  const diff = (meeting.day_of_week - now.getDay() + 7) % 7;
  target.setDate(target.getDate() + diff);
  if (target <= now) target.setDate(target.getDate() + 7);
  return target;
}

function formatCountdown(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return `in ${mins}m`;
}

export default function TeamMeetings({ teamId, currentUser, userRole }: TeamMeetingsProps) {
  const [meetings, setMeetings] = useState<TeamMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDay, setNewDay] = useState<string>("");
  const [newTime, setNewTime] = useState("");
  const [newDuration, setNewDuration] = useState("30");
  const [newMeetUrl, setNewMeetUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const loadMeetings = useCallback(async () => {
    const { data } = await supabase
      .from("team_meetings")
      .select("*")
      .eq("team_id", teamId)
      .order("day_of_week", { ascending: true });

    if (data) setMeetings(data);
    setLoading(false);
  }, [teamId, supabase]);

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);

    const { data, error } = await supabase
      .from("team_meetings")
      .insert({
        team_id: teamId,
        name: newName.trim(),
        day_of_week: newDay !== "" ? Number(newDay) : null,
        time: newTime || null,
        duration_minutes: Number(newDuration) || 30,
        meet_url: newMeetUrl.trim() || null,
        created_by: currentUser,
      })
      .select()
      .single();

    if (data && !error) {
      setMeetings([...meetings, data]);
      setShowCreate(false);
      setNewName("");
      setNewDay("");
      setNewTime("");
      setNewDuration("30");
      setNewMeetUrl("");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await supabase.from("team_meetings").delete().eq("id", id);
    setMeetings(meetings.filter((m) => m.id !== id));
  }

  const sorted = [...meetings].sort((a, b) => {
    const nextA = getNextOccurrence(a);
    const nextB = getNextOccurrence(b);
    if (nextA && nextB) return nextA.getTime() - nextB.getTime();
    if (nextA) return -1;
    if (nextB) return 1;
    return (a.day_of_week ?? 99) - (b.day_of_week ?? 99);
  });

  const nextMeeting = sorted.find((m) => getNextOccurrence(m));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          {nextMeeting && (
            <p className="text-sm text-slate-600">
              Next: <span className="font-medium text-indigo-600">{nextMeeting.name}</span>
              {" "} — {DAYS[nextMeeting.day_of_week!]} at {nextMeeting.time}
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500">
                <Clock size={10} /> {formatCountdown(getNextOccurrence(nextMeeting)!)}
              </span>
            </p>
          )}
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus size={14} />
          New Meeting
        </Button>
      </div>

      {meetings.length === 0 ? (
        <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl">
          <Calendar size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 mb-3">No recurring meetings set up</p>
          <Button onClick={() => setShowCreate(true)} size="sm"><Plus size={14} /> Add Meeting</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sorted.map((meeting) => {
            const next = getNextOccurrence(meeting);
            return (
              <div key={meeting.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-200 transition-all group">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-slate-900">{meeting.name}</h4>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {meeting.day_of_week !== null ? DAYS[meeting.day_of_week] : "Flexible"}
                      {meeting.time && ` at ${meeting.time}`}
                      {meeting.duration_minutes && ` · ${meeting.duration_minutes}min`}
                    </p>
                    {next && (
                      <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1">
                        <Clock size={10} /> Next: {formatCountdown(next)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {meeting.meet_url && (
                      <a
                        href={meeting.meet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded text-green-600 hover:bg-green-50"
                        title="Join meeting"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    {(userRole === "owner" || userRole === "admin") && (
                      <button onClick={() => void handleDelete(meeting.id)} className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {meeting.meet_url && (
                  <a
                    href={meeting.meet_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      "bg-green-50 text-green-700 hover:bg-green-100"
                    )}
                  >
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    Join Google Meet
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Meeting">
        <div className="space-y-4">
          <Input label="Meeting Name" placeholder="e.g. Weekly Sync" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Day of Week</label>
            <select value={newDay} onChange={(e) => setNewDay(e.target.value)} className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="">Flexible / Not recurring</option>
              {DAYS.map((day, i) => (
                <option key={i} value={i}>{day}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Time" type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
            <Input label="Duration (min)" type="number" value={newDuration} onChange={(e) => setNewDuration(e.target.value)} />
          </div>
          <Input label="Google Meet Link (optional)" placeholder="https://meet.google.com/..." value={newMeetUrl} onChange={(e) => setNewMeetUrl(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={saving || !newName.trim()}>
              {saving ? "Creating..." : "Create Meeting"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
