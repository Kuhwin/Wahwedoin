"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, Pencil, CalendarDays, Video, Loader2, Clock } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import { createGoogleCalendarEvent, updateGoogleCalendarEvent, deleteGoogleCalendarEvent } from "@/lib/linkedAccounts";
import { useTimezone } from "@/lib/useTimezone";
import EventDetailModal, { type EventDetailData } from "@/components/EventDetailModal";

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4"];

const RECURRENCE_OPTIONS = [
  { value: "", label: "Does not repeat" },
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
  { value: "yearly", label: "Every year" },
];

interface ProjectEvent {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  all_day: boolean;
  color: string;
  recurrence: string | null;
  recurrence_end: string | null;
  meet_link: string | null;
  attendees: { email: string; name?: string; status?: string }[] | null;
  created_by: string | null;
  google_account_id: string | null;
  google_event_id: string | null;
}

export default function ProjectEvents({
  projectId,
  teamId,
  projectColor,
}: {
  projectId: string;
  teamId: string;
  projectColor?: string;
}) {
  const supabase = createClient();
  const { timezone } = useTimezone();
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ProjectEvent | null>(null);
  const [selected, setSelected] = useState<EventDetailData | null>(null);

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(true);
  const [color, setColor] = useState(projectColor || COLORS[0]);
  const [recurrence, setRecurrence] = useState("");
  const [recurrenceEnd, setRecurrenceEnd] = useState("");
  const [meetLink, setMeetLink] = useState("");
  const [syncToGoogle, setSyncToGoogle] = useState(false);
  const [accounts, setAccounts] = useState<{ id: string; email: string }[]>([]);
  const [syncAccountId, setSyncAccountId] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("event_projects")
      .select("events(id, title, description, start_date, end_date, all_day, color, recurrence, recurrence_end, meet_link, attendees, created_by, google_account_id, google_event_id)")
      .eq("project_id", projectId);
    const rows = ((data as { events: ProjectEvent }[] | null) || [])
      .map((r) => r.events)
      .filter(Boolean)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    setEvents(rows);
    setLoading(false);
  }

  async function loadAccounts() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: accs } = await supabase
      .from("user_google_accounts")
      .select("id, email")
      .eq("user_id", user.id)
      .ilike("scope", "%calendar%");
    if (accs) setAccounts(accs);
  }

  useEffect(() => {
    void load();
    void loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startDate) return;
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    const effEndDate = endDate || startDate;
    const effEndTime = allDay ? "" : endTime || (() => {
      const [h, m] = (startTime || "09:00").split(":").map(Number);
      const d = new Date();
      d.setHours((h + 1) % 24, m, 0, 0);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    })();
    const startDateTime = allDay ? startDate + "T00:00:00Z" : startDate + "T" + startTime + ":00Z";
    const endDateTime = allDay ? effEndDate + "T23:59:59Z" : effEndDate + "T" + effEndTime + ":00Z";

    const { data, error } = await supabase
      .from("events")
      .insert({
        title: title.trim(),
        description: desc.trim() || null,
        team_id: teamId,
        start_date: startDateTime,
        end_date: endDateTime,
        all_day: allDay,
        color,
        created_by: user?.id,
        recurrence: recurrence || null,
        recurrence_end: recurrenceEnd || null,
        meet_link: meetLink.trim() || null,
        google_account_id: syncToGoogle && syncAccountId ? syncAccountId : null,
      })
      .select()
      .single();

    if (data && !error) {
      const { error: linkErr } = await supabase
        .from("event_projects")
        .insert({ event_id: data.id, project_id: projectId });
      if (linkErr) {
        // Event created but linking failed — still show it, just without the project tag.
      }

      if (syncToGoogle && syncAccountId) {
        const googleEvent = await createGoogleCalendarEvent(syncAccountId, {
          title: title.trim(),
          description: desc.trim() || null,
          start: startDateTime,
          end: endDateTime,
          allDay,
          meetLink: meetLink.trim() || null,
          timezone,
        });
        if (googleEvent) {
          const generatedMeetLink = googleEvent.hangoutLink || meetLink.trim() || null;
          await supabase.from("events").update({
            google_event_id: googleEvent.googleEventId,
            meet_link: generatedMeetLink,
          }).eq("id", data.id);
          data.google_event_id = googleEvent.googleEventId;
          data.meet_link = generatedMeetLink;
        }
      }

      setEvents([...events, { ...data, all_day: data.all_day }].sort((a, b) => a.start_date.localeCompare(b.start_date)));
      setShowCreate(false);
      setTitle("");
      setDesc("");
      setStartDate("");
      setEndDate("");
      setColor(projectColor || COLORS[0]);
      setRecurrence("");
      setRecurrenceEnd("");
      setMeetLink("");
      setAllDay(true);
      setSyncToGoogle(false);
      setSyncAccountId("");
    }
    setCreating(false);
  }

  function handleEdit(evt: ProjectEvent) {
    setEditing(evt);
    setTitle(evt.title);
    setDesc(evt.description || "");
    setStartDate(evt.start_date.split("T")[0]);
    setEndDate(evt.end_date ? evt.end_date.split("T")[0] : "");
    setAllDay(evt.all_day);
    if (evt.all_day) {
      setStartTime("09:00");
      setEndTime("10:00");
    } else {
      setStartTime(evt.start_date.slice(11, 16));
      setEndTime(evt.end_date ? evt.end_date.slice(11, 16) : "10:00");
    }
    setColor(evt.color || projectColor || COLORS[0]);
    setRecurrence(evt.recurrence || "");
    setRecurrenceEnd(evt.recurrence_end || "");
    setMeetLink(evt.meet_link || "");
    setSyncToGoogle(!!evt.google_account_id);
    setSyncAccountId(evt.google_account_id || "");
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !title.trim() || !startDate) return;
    setSaving(true);
    const effEndDate = endDate || startDate;
    const effEndTime = allDay ? "" : endTime || (() => {
      const [h, m] = (startTime || "09:00").split(":").map(Number);
      const d = new Date();
      d.setHours((h + 1) % 24, m, 0, 0);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    })();
    const startDateTime = allDay ? startDate + "T00:00:00Z" : startDate + "T" + startTime + ":00Z";
    const endDateTime = allDay ? effEndDate + "T23:59:59Z" : effEndDate + "T" + effEndTime + ":00Z";

    await supabase.from("events").update({
      title: title.trim(),
      description: desc.trim() || null,
      start_date: startDateTime,
      end_date: endDateTime,
      all_day: allDay,
      color,
      recurrence: recurrence || null,
      recurrence_end: recurrenceEnd || null,
      meet_link: meetLink.trim() || null,
    }).eq("id", editing.id);

    if (editing.google_account_id) {
      await updateGoogleCalendarEvent(editing.google_account_id, editing.google_event_id!, {
        title: title.trim(),
        description: desc.trim() || null,
        start: startDateTime,
        end: endDateTime,
        allDay,
        meetLink: meetLink.trim() || null,
        timezone,
      });
    }

    const updated: ProjectEvent = {
      ...editing,
      title: title.trim(),
      description: desc.trim() || null,
      start_date: startDateTime,
      end_date: endDateTime,
      all_day: allDay,
      color,
      recurrence: recurrence || null,
      meet_link: meetLink.trim() || null,
    };
    setEvents(events.map((x) => (x.id === editing.id ? updated : x)).sort((a, b) => a.start_date.localeCompare(b.start_date)));
    setEditing(null);
    setSaving(false);
  }

  async function handleDelete(evt: ProjectEvent) {
    if (!window.confirm(`Delete "${evt.title}"?`)) return;
    if (evt.google_account_id && evt.google_event_id) {
      await deleteGoogleCalendarEvent(evt.google_account_id, evt.google_event_id);
    }
    await supabase.from("events").delete().eq("id", evt.id);
    setEvents(events.filter((e) => e.id !== evt.id));
    setSelected(null);
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <CalendarDays size={14} />
          Project Events ({events.length})
        </h3>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} />
          New Event
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={18} className="animate-spin text-slate-400 dark:text-slate-500" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-10">
          No events yet. Click &quot;New Event&quot; to schedule one for this project — it will appear on the team calendar.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {events.map((evt) => {
            const start = new Date(evt.start_date);
            const isPast = evt.end_date < new Date().toISOString();
            const dayLabel = start.toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
            const timeLabel = evt.all_day ? "All day" : start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
            return (
              <button
                key={evt.id}
                onClick={() => setSelected({
                  id: evt.id,
                  title: evt.title,
                  description: evt.description,
                  start: evt.start_date,
                  end: evt.end_date,
                  allDay: evt.all_day,
                  color: evt.color || "#6366f1",
                  meetLink: evt.meet_link,
                  attendees: evt.attendees,
                  recurrence: evt.recurrence,
                })}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group flex items-center gap-3"
              >
                <div
                  className="h-10 w-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: evt.color || "#6366f1", opacity: isPast ? 0.4 : 1 }}
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate group-hover:text-accent dark:group-hover:text-accent ${isPast ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100"}`}>
                    {evt.title}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Clock size={10} />
                    {dayLabel} · {timeLabel}
                    {evt.recurrence && " · Repeats"}
                  </p>
                </div>
                {evt.meet_link && (
                  <span
                    onClick={(e) => { e.stopPropagation(); window.open(evt.meet_link!, "_blank"); }}
                    className="p-1.5 rounded text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                    title="Join meeting"
                  >
                    <Video size={14} />
                  </span>
                )}
                <span
                  onClick={(e) => { e.stopPropagation(); handleEdit(evt); }}
                  className="p-1.5 rounded text-slate-300 dark:text-slate-600 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors opacity-0 group-hover:opacity-100"
                  title="Edit event"
                >
                  <Pencil size={14} />
                </span>
                <span
                  onClick={(e) => { e.stopPropagation(); void handleDelete(evt); }}
                  className="p-1.5 rounded text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete event"
                >
                  <Trash2 size={14} />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Create/Edit event modal */}
      <Modal open={showCreate || !!editing} onClose={() => { setShowCreate(false); setEditing(null); }} title={editing ? "Edit Project Event" : "New Project Event"}>
        <form onSubmit={editing ? handleSaveEdit : handleCreate} className="space-y-4">
          <Input label="Event Title" placeholder="e.g. Kickoff call" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Event details..."
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 resize-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            <Input label="End Date (optional)" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="pe-allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-accent/50" />
            <label htmlFor="pe-allDay" className="text-sm text-slate-700 dark:text-slate-300">All day event</label>
          </div>
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Start Time</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">End Time (optional)</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
              </div>
            </div>
          )}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Repeat</label>
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
              {RECURRENCE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          {recurrence && (
            <Input label="Repeat until (optional)" type="date" value={recurrenceEnd} onChange={(e) => setRecurrenceEnd(e.target.value)} />
          )}
          <Input label="Google Meet Link (optional)" placeholder="https://meet.google.com/..." value={meetLink} onChange={(e) => setMeetLink(e.target.value)} />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Colour</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-lg transition-all ${color === c ? "ring-2 ring-offset-2 ring-indigo-500 scale-110" : "hover:scale-105"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          {accounts.length > 0 && (
            <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={syncToGoogle} onChange={(e) => { setSyncToGoogle(e.target.checked); if (e.target.checked && !syncAccountId) setSyncAccountId(accounts[0].id); }} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-accent/50" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Sync to Google Calendar</span>
              </label>
              {syncToGoogle && (
                <select value={syncAccountId} onChange={(e) => setSyncAccountId(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                  {accounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.email}</option>)}
                </select>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowCreate(false); setEditing(null); }}>Cancel</Button>
            <Button type="submit" disabled={creating || saving || !title.trim()}>
              {creating ? "Creating..." : saving ? "Saving..." : editing ? "Save Changes" : "Create Event"}
            </Button>
          </div>
        </form>
      </Modal>

      <EventDetailModal event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
