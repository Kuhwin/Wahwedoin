"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import { type Event, type Team } from "@/lib/types";

export default function CalendarPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTeamId, setNewTeamId] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [newAllDay, setNewAllDay] = useState(true);
  const [creating, setCreating] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberships } = await supabase
        .from("team_members")
        .select("team_id, teams(*)")
        .eq("user_id", user.id);

      if (memberships) {
        const teamList = (memberships as { teams: Team }[]).map((m) => m.teams).filter(Boolean);
        setTeams(teamList);
        if (teamList.length > 0) setNewTeamId(teamList[0].id);
      }

      const { data: eventsData } = await supabase
        .from("events")
        .select("*")
        .order("start_date", { ascending: true });

      if (eventsData) setEvents(eventsData);
    }
    void load();
  }, [supabase]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [firstDayOfWeek, daysInMonth]);

  function getEventsForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((event) => {
      const start = event.start_date.split("T")[0];
      const end = event.end_date.split("T")[0];
      return dateStr >= start && dateStr <= end;
    });
  }

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  function handleDayClick(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate(dateStr);
    setNewStartDate(dateStr);
    setNewEndDate(dateStr);
    setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newTeamId) return;
    setCreating(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("events")
      .insert({
        title: newTitle.trim(),
        description: newDesc.trim() || null,
        team_id: newTeamId,
        start_date: newStartDate + "T00:00:00Z",
        end_date: newEndDate + "T23:59:59Z",
        all_day: newAllDay,
        created_by: user?.id,
      })
      .select()
      .single();

    if (data && !error) {
      setEvents([...events, data]);
      setShowCreate(false);
      setNewTitle("");
      setNewDesc("");
    }
    setCreating(false);
  }

  const monthName = currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
          <p className="text-sm text-slate-500 mt-1">Shared calendar across all teams</p>
        </div>
        <Button onClick={() => { setSelectedDate(""); setShowCreate(true); }}>
          <Plus size={16} />
          New Event
        </Button>
      </div>

      {/* Calendar Navigation */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-lg font-semibold text-slate-900">{monthName}</h2>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b border-slate-200">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="text-center text-xs font-medium text-slate-500 py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            const dayEvents = day ? getEventsForDay(day) : [];
            const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
            return (
              <div
                key={idx}
                className={`min-h-[80px] md:min-h-[100px] border-b border-r border-slate-100 p-1.5 last:border-r-0 ${
                  day ? "cursor-pointer hover:bg-slate-50" : ""
                }`}
                onClick={() => day && handleDayClick(day)}
              >
                {day && (
                  <>
                    <div className={`text-xs font-medium mb-1 ${
                      isToday ? "bg-indigo-600 text-white h-5 w-5 rounded-full flex items-center justify-center" : "text-slate-700"
                    }`}>
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((event) => (
                        <div
                          key={event.id}
                          className="text-[10px] px-1 py-0.5 rounded truncate text-white"
                          style={{ backgroundColor: event.color }}
                          title={event.title}
                        >
                          {event.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-slate-400 px-1">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Create Event Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Event">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Event Title"
            placeholder="Liming"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Description</label>
            <textarea
              placeholder="Event details..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Team</label>
            <select
              value={newTeamId}
              onChange={(e) => setNewTeamId(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Date"
              type="date"
              value={newStartDate}
              onChange={(e) => setNewStartDate(e.target.value)}
              required
            />
            <Input
              label="End Date"
              type="date"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDay"
              checked={newAllDay}
              onChange={(e) => setNewAllDay(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="allDay" className="text-sm text-slate-700">All day event</label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create Event"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
