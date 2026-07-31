"use client";

import { Repeat, Video, Users, ExternalLink } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

export interface EventDetailData {
  id: string;
  title: string;
  description?: string | null;
  start: string;
  end: string;
  allDay: boolean;
  color: string;
  source?: string | null;
  meetLink?: string | null;
  attendees?: Array<{ email: string; name?: string; status?: string }> | null;
  recurrence?: string | null;
  external?: boolean;
}

interface EventDetailModalProps {
  event: EventDetailData | null;
  onClose: () => void;
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function EventDetailModal({ event, onClose }: EventDetailModalProps) {
  return (
    <Modal open={!!event} onClose={onClose} title="Event Details">
      {event && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-3 w-3 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: event.color }} />
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{event.title}</h3>
              {event.description && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-wrap">{event.description}</p>
              )}
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Start</span>
              <p className="text-slate-900 dark:text-slate-100">
                {formatDate(event.start)}
                {!event.allDay && event.start && (
                  <span className="ml-1 text-slate-600 dark:text-slate-300">{formatTime(event.start)}</span>
                )}
              </p>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">End</span>
              <p className="text-slate-900 dark:text-slate-100">
                {formatDate(event.end)}
                {!event.allDay && event.end && (
                  <span className="ml-1 text-slate-600 dark:text-slate-300">{formatTime(event.end)}</span>
                )}
              </p>
            </div>
          </div>

          {/* Badges & Links */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            {event.recurrence && event.recurrence !== "none" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                <Repeat size={10} /> Recurring
              </span>
            )}
            {(event.external || event.source) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                <ExternalLink size={10} /> {event.source || "External"}
              </span>
            )}
            {event.allDay && (
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">All day</span>
            )}
            {event.meetLink && (
              <a href={event.meetLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors">
                <Video size={10} /> Join Google Meet
              </a>
            )}
          </div>

          {/* Attendees */}
          {event.attendees && event.attendees.length > 0 && (
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-2">
                <Users size={10} className="inline mr-1" />
                Attendees ({event.attendees.length})
              </span>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {event.attendees.map((a, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-medium text-slate-600 dark:text-slate-300 flex-shrink-0">
                        {(a.name || a.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-slate-900 dark:text-slate-100 truncate">{a.name || a.email}</p>
                        {a.name && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{a.email}</p>}
                      </div>
                    </div>
                    <span className={`text-xs font-medium flex-shrink-0 ml-2 ${
                      a.status === "accepted" ? "text-green-600 dark:text-green-400" :
                      a.status === "declined" ? "text-red-600 dark:text-red-400" :
                      a.status === "tentative" ? "text-amber-600 dark:text-amber-400" :
                      "text-slate-400 dark:text-slate-500"
                    }`}>
                      {a.status === "accepted" ? "Accepted" : a.status === "declined" ? "Declined" : a.status === "tentative" ? "Maybe" : "Pending"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
