"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";
import {
  Bell,
  CheckCircle,
  MessageSquare,
  Users,
  FolderKanban,
  Calendar,
  CheckCheck,
  Inbox as InboxIcon,
} from "lucide-react";

const PAGE_SIZE = 20;

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  task: <CheckCircle size={16} className="text-blue-500" />,
  comment: <MessageSquare size={16} className="text-purple-500" />,
  member: <Users size={16} className="text-green-500" />,
  project: <FolderKanban size={16} className="text-indigo-500" />,
  event: <Calendar size={16} className="text-orange-500" />,
  default: <Bell size={16} className="text-slate-400 dark:text-slate-500" />,
};

function getIcon(type: string) {
  return TYPE_ICONS[type] || TYPE_ICONS.default;
}

export default function InboxPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

  const loadNotifications = useCallback(async (reset = true) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    if (reset) setUserId(user.id);

    const offset = reset ? 0 : notifications.length;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    if (data) {
      if (reset) {
        setNotifications(data);
      } else {
        setNotifications((prev) => [...prev, ...data]);
      }
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [supabase, notifications.length]);

  useEffect(() => {
    void loadNotifications(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const channel = supabase
      .channel(`inbox-notifications-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload: { new: NotificationItem }) => {
          if (cancelled) return;
          setNotifications((prev) =>
            prev.some((n) => n.id === payload.new.id) ? prev : [payload.new, ...prev],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload: { new: NotificationItem }) => {
          if (cancelled) return;
          setNotifications((prev) =>
            prev.map((n) => (n.id === payload.new.id ? payload.new : n)),
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void channel.unsubscribe();
    };
  }, [supabase, userId]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filtered = filter === "unread"
    ? notifications.filter((n) => !n.read)
    : notifications;

  async function handleMarkAsRead(id: string) {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", id);

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    window.dispatchEvent(new Event("notifications:changed"));
  }

  async function handleMarkAllRead() {
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
    }
    const targetUserId = userId ?? (await supabase.auth.getUser()).data.user?.id;
    if (!targetUserId) return;

    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", targetUserId)
      .eq("read", false);

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    window.dispatchEvent(new Event("notifications:changed"));
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    await loadNotifications(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            Inbox
            {unreadCount > 0 && (
              <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full">
                {unreadCount} unread
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Stay up to date with your notifications</p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
          >
            <CheckCheck size={16} />
            Mark all as read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            filter === "all"
              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            filter === "unread"
              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          Unread
          {unreadCount > 0 && (
            <span className="ml-1.5 text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Notification List */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <InboxIcon size={48} className="text-slate-200 dark:text-slate-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-1">
            {filter === "unread" ? "No unread notifications" : "You're all caught up!"}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filter === "unread"
              ? "All notifications have been read."
              : "Check back later for new updates."}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-700/50">
            {filtered.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  if (!n.read) handleMarkAsRead(n.id);
                }}
                className={`flex items-start gap-3 px-5 py-4 transition-colors cursor-pointer ${
                  !n.read ? "bg-indigo-50/40 dark:bg-indigo-900/10 hover:bg-indigo-50 dark:hover:bg-indigo-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <div className="mt-0.5 flex-shrink-0">
                  {getIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm ${!n.read ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300"}`}>
                      {n.title}
                    </p>
                    {!n.read && (
                      <span className="h-2 w-2 rounded-full bg-indigo-500 dark:bg-indigo-400 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {formatRelativeTime(n.created_at)}
                    </span>
                    {n.link && (
                      <Link
                        href={n.link}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                      >
                        View
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {hasMore && filter === "all" && (
            <div className="flex justify-center mt-4">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-50"
              >
                {loadingMore ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    Loading…
                  </span>
                ) : (
                  "Load more"
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
