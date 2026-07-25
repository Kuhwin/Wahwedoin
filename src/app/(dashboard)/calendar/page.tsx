"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChevronLeft, ChevronRight, Plus, Link2, Trash2, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import { type Event, type Team, type CalendarLink } from "@/lib/types";
import { fetchAllAccountsCalendar } from "@/lib/linkedAccounts";
import { getHolidaysForYear } from "@/lib/holidays";

interface ExternalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description: string;
  allDay: boolean;
  color: string;
  source?: string;
}

const CALENDAR_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
];

export default function CalendarPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [externalEvents, setExternalEvents] = useState<ExternalEvent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [showLinkCal, setShowLinkCal] = useState(false);
  const [, setSelectedDate] = useState<string>("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTeamId, setNewTeamId] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [newAllDay, setNewAllDay] = useState(true);
  const [creating, setCreating] = useState(false);

  // Calendar linking state
  const [calLinks, setCalLinks] = useState<CalendarLink[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkColor, setLinkColor] = useState(CALENDAR_COLORS[0]);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [loadingCal, setLoadingCal] = useState(false);

  const supabase = createClient();

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: memberships } = await supabase
      .from("team_members")
      .select("team_id, teams(*)")
      .eq("user_id", user.id);

    if (memberships) {
      const teamList = (memberships as { teams: Team }[]).map((m) => m.teams).filter(Boolean);
      setTeams(teamList);
      if (teamList.length > 0 && !newTeamId) setNewTeamId(teamList[0].id);
    }

    const { data: eventsData } = await supabase
      .from("events")
      .select("*")
      .order("start_date", { ascending: true });

    if (eventsData) setEvents(eventsData);

    const allExternal: ExternalEvent[] = [];

    // Load Bajan holidays for current and next year
    const now = new Date();
    const holidayYears = [now.getFullYear(), now.getFullYear() + 1];
    for (const year of holidayYears) {
      for (const h of getHolidaysForYear(year)) {
        allExternal.push({
          id: `holiday-${h.dateStr}-${h.name}`,
          title: h.name,
          start: `${h.dateStr}T00:00:00Z`,
          end: `${h.dateStr}T23:59:59Z`,
          description: "Barbados public holiday",
          allDay: true,
          color: "#16a34a",
          source: "Barbados Holidays",
        });
      }
    }

    // Load calendar links for user's teams
    const teamIds = (memberships || []).map((m: { team_id: string }) => m.team_id);
    if (teamIds.length > 0) {
      const { data: links } = await supabase
        .from("calendar_links")
        .select("*")
        .in("team_id", teamIds);
      if (links) {
        setCalLinks(links);
        // Fetch iCal events
        await Promise.all(
          links.map(async (link) => {
            try {
              const res = await fetch("/api/calendar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: link.ical_url, color: link.color }),
              });
              if (res.ok) {
                const data = await res.json();
                if (data.events) {
                  allExternal.push(
                    ...data.events.map((e: ExternalEvent) => ({
                      ...e,
                      color: link.color,
                    }))
                  );
                }
              }
            } catch {
              // Skip failed calendars silently
            }
          })
        );
      }
    }

    // Fetch Google Calendar events from linked accounts
    try {
      const googleResults = await fetchAllAccountsCalendar(user.id);
      for (const result of googleResults) {
        for (const event of result.events) {
          allExternal.push({
            id: event.id,
            title: event.title,
            start: event.start,
            end: event.end,
            description: event.description,
            allDay: event.allDay,
            color: "#4285F4",
            source: result.accountEmail,
          });
        }
      }
    } catch {
      // Google Calendar fetch failed silently
    }

    setExternalEvents(allExternal);
  }, [supabase, newTeamId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function fetchAllExternalEvents(links: CalendarLink[]) {
    setLoadingCal(true);
    const allEvents: ExternalEvent[] = [];

    await Promise.all(
      links.map(async (link) => {
        try {
          const res = await fetch("/api/calendar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: link.ical_url, color: link.color }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.events) {
              allEvents.push(
                ...data.events.map((e: ExternalEvent) => ({
                  ...e,
                  color: link.color,
                }))
              );
            }
          }
        } catch {
          // Skip failed calendars silently
        }
      })
    );

    setExternalEvents((prev) => {
      const holidays = prev.filter((e) => e.source === "Barbados Holidays");
      const google = prev.filter((e) => e.source !== "Barbados Holidays" && !links.some((l) => l.color === e.color && !e.source?.includes("@")));
      return [...holidays, ...google, ...allEvents];
    });
    setLoadingCal(false);
  }

  async function handleLinkCalendar(e: React.FormEvent) {
    e.preventDefault();
    if (!linkUrl.trim()) return;
    setLinking(true);
    setLinkError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Pick first team if none selected
    const teamId = newTeamId || teams[0]?.id;
    if (!teamId) {
      setLinkError("You need to be in a team first.");
      setLinking(false);
      return;
    }

    // Test the URL first
    try {
      const testRes = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: linkUrl.trim(), color: linkColor }),
      });
      const testData = await testRes.json();
      if (!testRes.ok) {
        setLinkError(testData.error || "Could not fetch this calendar. Check the URL.");
        setLinking(false);
        return;
      }
      if (testData.events?.length === 0) {
        setLinkError("Calendar loaded but no events found. The URL may be correct but the calendar is empty.");
      }
    } catch {
      setLinkError("Could not reach this calendar URL.");
      setLinking(false);
      return;
    }

    const { data: link, error } = await supabase
      .from("calendar_links")
      .insert({
        user_id: user.id,
        team_id: teamId,
        label: linkLabel.trim() || "My Calendar",
        ical_url: linkUrl.trim(),
        color: linkColor,
      })
      .select()
      .single();

    if (error) {
      setLinkError(error.message || "Failed to save calendar link.");
    } else if (link) {
      setCalLinks([...calLinks, link]);
      setLinkUrl("");
      setLinkLabel("");
      setShowLinkCal(false);
      setLinkError("");
      // Re-fetch all external events
      fetchAllExternalEvents([...calLinks, link]);
    }
    setLinking(false);
  }

  async function handleRemoveLink(linkId: string) {
    await supabase.from("calendar_links").delete().eq("id", linkId);
    const remaining = calLinks.filter((l) => l.id !== linkId);
    setCalLinks(remaining);
    fetchAllExternalEvents(remaining);
  }

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

    // Internal events
    const internal = events.filter((event) => {
      const start = event.start_date.split("T")[0];
      const end = event.end_date.split("T")[0];
      return dateStr >= start && dateStr <= end;
    }).map((e) => ({
      id: e.id,
      title: e.title,
      color: e.color,
      type: "internal" as const,
      source: undefined,
    }));

    // External events
    const external = externalEvents.filter((event) => {
      const start = event.start.split("T")[0];
      const end = event.end.split("T")[0];
      return dateStr >= start && dateStr <= end;
    }).map((e) => ({
      id: e.id,
      title: e.title,
      color: e.color,
      type: "external" as const,
      source: e.source,
    }));

    return [...internal, ...external];
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Calendar</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Shared calendar across all teams
            {loadingCal && (
              <span className="inline-flex items-center gap-1 ml-2 text-indigo-600">
                <Loader2 size={12} className="animate-spin" /> Loading calendars...
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowLinkCal(true)}>
            <Link2 size={14} />
            Link Calendar
          </Button>
          <Button onClick={() => { setSelectedDate(""); setShowCreate(true); }}>
            <Plus size={16} />
            New Event
          </Button>
        </div>
      </div>

      {/* Linked Calendars */}
      {calLinks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs font-medium text-slate-500">Linked:</span>
          {calLinks.map((link) => (
            <div
              key={link.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 group"
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: link.color }} />
              {link.label}
              <button
                onClick={() => handleRemoveLink(link.id)}
                className="opacity-0 group-hover:opacity-100 ml-0.5 text-slate-400 hover:text-red-500 transition-all"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
          <span className="h-2 w-2 rounded-full bg-green-600" />
          Barbados Holidays
        </div>
        {externalEvents.some((e) => e.color === "#4285F4") && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            <span className="h-2 w-2 rounded-full bg-[#4285F4]" />
            Google Calendar
          </div>
        )}
      </div>

      {/* Calendar Navigation */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden dark:bg-slate-900 dark:border-slate-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 dark:text-slate-400 dark:hover:bg-slate-800">
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{monthName}</h2>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 dark:text-slate-400 dark:hover:bg-slate-800">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 py-2">
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
                className={`min-h-[80px] md:min-h-[100px] border-b border-r border-slate-100 dark:border-slate-700/50 p-1.5 last:border-r-0 ${
                  day ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : ""
                }`}
                onClick={() => day && handleDayClick(day)}
              >
                {day && (
                  <>
                    <div className={`text-xs font-medium mb-1 ${
                      isToday ? "bg-indigo-600 text-white h-5 w-5 rounded-full flex items-center justify-center" : "text-slate-700 dark:text-slate-300"
                    }`}>
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((event) => (
            <div
              key={event.id}
              className="text-[10px] px-1 py-0.5 rounded truncate text-white"
              style={{ backgroundColor: event.color }}
              title={`${event.title}${event.source ? ` (${event.source})` : ""}`}
            >
                          {event.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 px-1">
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
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
            <textarea
              placeholder="Event details..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Team</label>
            <select
              value={newTeamId}
              onChange={(e) => setNewTeamId(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
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
            <label htmlFor="allDay" className="text-sm text-slate-700 dark:text-slate-300">All day event</label>
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

      {/* Link Calendar Modal */}
      <Modal open={showLinkCal} onClose={() => { setShowLinkCal(false); setLinkError(""); }} title="Link Google Calendar">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Paste your Google Calendar&apos;s public iCal URL to show your events alongside your team&apos;s.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400">
            <p className="font-medium text-slate-700 dark:text-slate-300">How to get your iCal URL:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-slate-500">
              <li>Open <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Google Calendar</a></li>
              <li>Click the gear icon → Settings</li>
              <li>Select your calendar on the left</li>
              <li>Scroll to &quot;Integrate calendar&quot;</li>
              <li>Copy the &quot;Public address in iCal format&quot;</li>
            </ol>
          </div>

          <form onSubmit={(e) => void handleLinkCalendar(e)} className="space-y-3">
            {linkError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {linkError}
              </div>
            )}
            <Input
              label="Calendar URL"
              placeholder="https://calendar.google.com/calendar/ical/..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              required
            />
            <Input
              label="Label (optional)"
              placeholder="e.g. My Calendar"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
            />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Color</label>
              <div className="flex gap-2">
                {CALENDAR_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setLinkColor(color)}
                    className={`h-7 w-7 rounded-lg transition-all ${linkColor === color ? "ring-2 ring-offset-2 ring-indigo-500 scale-110" : "hover:scale-105"}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => { setShowLinkCal(false); setLinkError(""); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={linking || !linkUrl.trim()}>
                {linking ? "Linking..." : "Link Calendar"}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
