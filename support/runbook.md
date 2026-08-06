# Outage Runbook

What to do when Wahwedoin or one of its dependencies goes down. Read the
**first 5 minutes** section first — most incidents are a single checkbox item.

## On-call quick reference

| Thing | Value |
|-------|-------|
| Production app | `https://wahwedoin-rb8m.vercel.app` |
| Public status page | see `monitoring.md` (also on the in-app `/status` page) |
| Fallback host | see `fallback.md` (in-app `/status` shows the link when set) |
| Supabase platform status | `https://status.supabase.com` |
| Vercel status | `https://www.vercel-status.com` |
| Google Cloud status | `https://status.cloud.google.com` |
| Repo | `https://github.com/Kuhwin/Wahwedoin` (runbook, deploy guides) |

## First 5 minutes (do these in order)

1. **Look at the monitor + status page.** Which check is red? Production,
   fallback, or nothing (whole host gone)?
2. **Is it a platform or is it us?** Check the provider status pages above
   before touching anything. Vercel/Supabase/Google all post real outages there.
3. **Confirm the app itself didn't regress.** If only Vercel is red, open the
   latest deployment in Vercel. A broken deploy is *not* an outage — see
   "Vercel app down (deploy regression)" below; roll back, don't cut over.
4. **Announce.** Post in the team channel: `🟠 Investigating: <what>`.
5. **Only after steps 1–4** follow the matching section below.

## 0. Alert handling

Every alert is one of:

- **Down** — monitor got no response (host unreachable).
- **Degraded** — app responded non-2xx (our `/api/health` returns 503 when the
  DB is unreachable; otherwise it's the app misbehaving).
- **SSL** — certificate problem (usually a misconfigured monitor, not the app).

If the status page shows **Production down but Fallback green**, the app server
is the problem and the database is fine — that is the cutover trigger.

## Vercel app down (host unreachable)

Trigger: monitor "no response", production URL times out, status page red.

1. Confirm it's not you: `https://www.vercel-status.com`.
2. Confirm it's not a broken deploy:
   - Vercel dashboard → latest deployment → build logs. If the build failed or
     the last deploy was suspicious, roll back (Deployments → ⋯ → Rollback)
     instead of cutting over.
3. **If Vercel itself is down** (their status page confirms): cut over.
   - Tell the team to use the **fallback host** (`fallback.md`). The in-app
     `/status` page links to it. There is no auto-DNS failover yet (needs the
     custom domain) — a link on the public status page is the notification.
   - If Google tokens are about to expire (Testing mode, ~7 days), on the
     fallback host OAuth login may not work — sign in with email/password or
     magic link.
4. Recovery: when Vercel is back, confirm `/api/health` returns 200, then
   announce `🟢 Resolved`.

## Vercel app down (deploy regression)

Trigger: app returns 5xx/errors after a deploy, Vercel status is green.

1. Vercel → Deployments → find the last successful deployment → Rollback.
2. Watch `/api/health` recover (monitor + status page).
3. If the regression is in `main`, don't redeploy the broken commit; fix it in
   a branch, merge, and let Vercel build normally.
4. Announce `🟢 Resolved` with the rollback SHA.

## Supabase down (database/auth/storage)

Trigger: `/api/health` returns 503 (`db: false`) but the app responds.

1. Confirm at `https://status.supabase.com`.
2. **The app is read-only-ish in practice** — pages that query Supabase will
   error. Notifications/emails will not send (cron fails fast). No action
   fixes this; wait for the platform.
3. Cut over to the fallback host does **not** help — it uses the same Supabase
   project.
4. **Data safety**: Supabase keeps continuous/daily backups of this project.
   A full platform-level failure is handled by Supabase itself; a data-loss
   event means restoring from backups (Supabase dashboard → Database →
   Backups). **Tier-2 (separate replicated project) is deferred** — revisit if
   we ever need to survive a Supabase outage.
5. Announce `🟢 Resolved` when the status page recovers and `/api/health` is
   green.

## Google down (OAuth, Gmail, Drive, Calendar sync)

Trigger: in-app `/status` shows Google red; users can't sign in with Google,
Gmail/Drive tabs error, calendar sync fails.

1. Confirm at `https://status.cloud.google.com`.
2. There is **nothing to fix** — these are optional integrations. The rest of
   the app keeps working.
3. **Workarounds**: sign in with email/password or magic link; Gmail/Drive
   features wait it out; calendar events keep working from the DB (only live
   Google sync is affected).
4. Announce `🟠 Degraded: Google integrations` and `🟢 Resolved` on recovery.

## Resend down (email notifications)

Trigger: in-app `/status` shows Email red; users stop getting assignment/due
emails.

1. Confirm at `https://resend.com/status` (or the API).
2. **No data loss**: the cron only marks `email_sent_at` when the send
   succeeds, so unsent notifications are retried on the next cron run. The
   default cadence is Mon/Thu 08:00 — if it's an urgent email, run the cron
   manually once Resend is back:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/send-notifications`
3. In-app notifications (bell, inbox) are unaffected — only email delivery.
4. Announce `🟢 Resolved` when checks are green.

## Fallback host down

Trigger: fallback monitor red (only matters during an actual cutover).

1. SSH into the VPS, `docker compose ps`, `docker compose logs --tail=50`.
2. Restart the container: `docker compose up -d --force-recreate`.
3. If it won't start, it's probably the env or a bad image — pull latest
   (`docker compose pull && docker compose up -d`) and re-check `.env`.
   Full troubleshooting in `fallback.md`.

## Escalation

- **You** = whoever got the alert (team channel or email list from
  `monitoring.md`).
- If not resolved in **30 minutes** or it's a data-loss risk, escalate to the
  repo owner in the team channel with: what's red, provider status, what
  you've tried, and whether the fallback host is up.

## Post-incident

After any real outage, append to this log:

```markdown
### YYYY-MM-DD HH:mm → HH:mm
- Trigger: (monitor / user report)
- Service: (Vercel / Supabase / Google / Resend / deploy)
- Root cause:
- Action taken:
- Follow-ups: (e.g. "add Tier-2", "buy domain", "tune monitor interval")
```
