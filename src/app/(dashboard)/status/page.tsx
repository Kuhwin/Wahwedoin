"use client";

import useSWR from "swr";
import {
  Activity,
  Database,
  Shield,
  Mail,
  Globe,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import type { HealthCheck, CheckStatus } from "@/lib/health";

interface HealthReport {
  overall: CheckStatus;
  checks: HealthCheck[];
  checkedAt: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<HealthReport>);

const STATUS_META: Record<CheckStatus, { label: string; badge: string; dot: string }> = {
  ok: {
    label: "Operational",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  degraded: {
    label: "Degraded",
    badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  down: {
    label: "Down",
    badge: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800",
    dot: "bg-red-500",
  },
  unconfigured: {
    label: "Not configured",
    badge: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    dot: "bg-slate-400",
  },
};

const CHECK_ICONS: Record<string, typeof Globe> = {
  app: Globe,
  database: Database,
  google: Shield,
  resend: Mail,
};

const fallbackUrl = process.env.NEXT_PUBLIC_FALLBACK_URL || "";
const statusPageUrl = process.env.NEXT_PUBLIC_STATUS_URL || "";

export default function StatusPage() {
  const { data, error, isLoading, mutate } = useSWR<HealthReport>("/api/health/detail", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });

  const overall = data?.overall || (error ? "down" : "unconfigured");
  const meta = STATUS_META[overall];
  const checks = data?.checks || [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">System Status</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Live health of the services Wah We Doin depends on.
          </p>
        </div>
        <button
          onClick={() => void mutate()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          Couldn&apos;t reach the health endpoint — the app server may be having problems.
        </div>
      )}

      <div className={`rounded-xl border p-5 flex items-center gap-4 ${meta.badge}`}>
        <span className={`h-3 w-3 rounded-full ${meta.dot} shrink-0`} />
        <div className="min-w-0">
          <div className="font-semibold text-base">All systems {overall === "ok" ? "operational" : "not fully operational"}</div>
          <div className="text-sm opacity-80 truncate">
            {data ? `Last checked ${new Date(data.checkedAt).toLocaleTimeString()}` : "Checking…"}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {checks.length === 0 && (
          <div className="rounded-xl border border-slate-200 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Loading checks…
          </div>
        )}
        {checks.map((check) => {
          const Icon = CHECK_ICONS[check.key] || Activity;
          const m = STATUS_META[check.status];
          return (
            <div
              key={check.key}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="rounded-lg bg-slate-100 p-2 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{check.label}</div>
                  {check.detail && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{check.detail}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {typeof check.latencyMs === "number" && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">{check.latencyMs}ms</span>
                )}
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.badge}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                  {m.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {(statusPageUrl || fallbackUrl) && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="font-medium text-slate-900 dark:text-slate-100 text-sm mb-2">Outage resources</div>
          <div className="flex flex-wrap gap-2">
            {statusPageUrl && (
              <a
                href={statusPageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Public status page
              </a>
            )}
            {fallbackUrl && (
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Use fallback host
              </a>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
