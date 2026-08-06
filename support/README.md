# Wahwedoin Support System

Everything needed to keep Wahwedoin running when a dependency goes down.

## What's in here

| File | Purpose |
|------|---------|
| `monitoring.md` | Set up the external uptime monitor + team status page (UptimeRobot / BetterStack). |
| `monitors.json` | Machine-readable monitor definitions for the provider above. |
| `runbook.md` | The on-call outage runbook — what to do when each service fails. |
| `fallback.md` | Tier-1 fallback: run the app on a spare VPS when Vercel is down. |

## In-app pieces

- `GET /api/health` — public liveness (app + database). Target of the external monitor and the Docker `HEALTHCHECK`. Returns 200 when healthy, 503 when the DB is unreachable, no response when the host is down.
- `GET /api/health/detail` — authenticated per-integration report (app, database, Google OAuth, Resend) backing the in-app page.
- `/status` — in-app status page (sidebar → System Status). Shows live health and, once configured, a link to the public status page and the fallback host.

## Service hierarchy

```
Wahwedoin app (Vercel) ──┬── Supabase (database, auth, storage)
                         ├── Google (OAuth, Gmail, Drive)
                         └── Resend (email)
Fallback host (VPS, Tier-1) ── same Supabase project
```

## Quick reference

- Production app: `https://wahwedoin-rb8m.vercel.app`
- Public status page: set after monitoring is configured (see `monitoring.md`)
- Fallback host: set after the VPS is deployed (see `fallback.md`)
- Supabase platform status: `https://status.supabase.com`
- Vercel status: `https://www.vercel-status.com`
- Google Cloud status: `https://status.cloud.google.com`

## Decisions made (scope)

- **Monitoring, status page, runbook, Tier-1 fallback** — built now.
- **Tier-2 (Supabase failover)** — deliberately deferred; relies on Supabase backups + their public status. See `runbook.md`.
- **Google OAuth publish/verify + custom domain** — still blocked on the domain purchase. Until then Google tokens expire ~7 days (Testing mode).
