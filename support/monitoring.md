# Monitoring + Status Page Setup

The app's own health endpoints only help while Vercel is up. A monitor hosted
**outside** the stack is the source of truth — it keeps watching even when
Vercel or Supabase go down. A managed uptime service also gives you a public
status page for free.

## 1. Pick a provider

- **BetterStack** (recommended): monitors, email/SMS/Slack/phone alerts, and a
  hosted status page in one product. Free tier is enough for this app.
- **UptimeRobot**: free tier with unlimited 5-min monitors. Status pages are
  available on their free tier. Fine alternative.

You only need to create **two monitors**; everything else is covered by the
in-app `/status` page (which checks Google + Resend on demand).

## 2. Create the monitors

Definitions are in [`monitors.json`](./monitors.json). In the provider dashboard:

| Monitor | URL | Expected | Interval | Notes |
|---------|-----|----------|----------|-------|
| Production (Vercel) | `https://wahwedoin-rb8m.vercel.app/api/health` | HTTP 200 | 1–5 min | End-to-end app + database check. Non-2xx → "degraded"; no response → "down". |
| Fallback (VPS) | `https://<fallback-domain-or-ip>/api/health` | HTTP 200 | 5 min | Only once the fallback host is deployed (`fallback.md`). If the primary is down and this stays green, the DB is fine — cut over. |

Tips for each provider:

- **BetterStack**: choose "URL" monitor, set *Expected status code* to `200`,
  and enable SSL monitoring. Add the alert channels (email + Slack) on both.
- **UptimeRobot**: HTTP(s) monitor, *Monitor type* HTTP, port 443, keyword or
  status-code 200. Add alert contacts for email/Slack.

Don't create separate monitors for Google or Resend — you can't fix them, and
the in-app `/status` page already reports them. Create one only if you want a
historical record.

## 3. Configure the status page

1. In the provider's dashboard, create a **status page** (public or
   password-protected for the team).
2. Attach the two monitors above.
3. Turn on **auto-reporting** (incidents open automatically when a monitor
   fails, close when it recovers).
4. Paste the status page URL as `NEXT_PUBLIC_STATUS_URL` in Vercel env vars and
   `.env.local` so the in-app `/status` page links to it.
5. Once you own a domain, point `status.<your-domain>` at the provider's
   status page for a branded URL.

## 4. Alert contacts

Decide up front who the on-call person is and where alerts land:

- **Email** (required) — should reach a phone via push notifications.
- **Slack/Teams** (recommended) — a `#incidents` channel.
- **SMS/phone** — only for the on-call person; outages are rare, false alarms
  will wake someone up.

## 5. Expect & test

- **Expected false positive**: a monitor will alert if the Vercel deployment
  is briefly cold-starting (rare) or during maintenance. Keep alert keywords
  tight and check the runbook before paging anyone.
- **Test the chain**: stop the production function or deploy a broken route
  in a preview, and confirm the alert fires and the status page flips. Then
  test the runbook's cutover step.

## 6. Maintenance windows

If you're about to do something that will trip a monitor (e.g. draining the DB
during a migration), open a manual maintenance window in the provider so the
team doesn't get paged.
