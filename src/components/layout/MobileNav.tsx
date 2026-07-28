"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CheckSquare, Calendar, FolderOpen, Mail, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotificationsCount } from "@/components/NotificationsCountProvider";

const items = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/my-tasks", icon: CheckSquare, label: "Tasks" },
  { href: "/calendar", icon: Calendar, label: "Calendar" },
  { href: "/drive", icon: FolderOpen, label: "Drive" },
  { href: "/gmail", icon: Mail, label: "Gmail" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const { unreadCount } = useNotificationsCount();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 md:hidden dark:bg-slate-900 dark:border-slate-700">
      <div className="flex items-center justify-around h-14">
        {items.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-[10px] font-medium transition-colors",
                isActive ? "text-indigo-600" : "text-slate-400 dark:text-slate-500"
              )}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <Link
          href="/inbox"
          className={cn(
            "relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-[10px] font-medium transition-colors",
            pathname === "/inbox" ? "text-indigo-600" : "text-slate-400 dark:text-slate-500"
          )}
        >
          <span className="relative">
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1.5 h-3.5 min-w-[14px] px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </span>
          <span>Inbox</span>
        </Link>
      </div>
    </nav>
  );
}
