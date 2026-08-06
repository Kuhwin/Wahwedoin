# Tier-1 Fallback Host (survive a Vercel outage)

A small always-on VPS runs the same app against the **same Supabase project**.
If Vercel goes down, the team points at the fallback URL and keeps working —
data and auth are untouched because they live in Supabase, not Vercel.

What this covers: Vercel down, broken deploys, anything where the app server
is unreachable. What it does NOT cover: Supabase down (see `runbook.md`, Tier-2
deferred), Google/Resend outages (degrade, don't fail over).

## How it works

- `next.config.ts` has `output: "standalone"` — the build emits a minimal
  `.next/standalone` server that runs with `node server.js` (no node_modules
  install needed).
- CI (`.github/workflows/fallback.yml`) runs the production build and pushes a
  Docker image to **GHCR** on every push to `main`.
- The VPS pulls that image and runs it behind Caddy (TLS). Secrets are injected
  via a `.env` file at deploy time — they are never baked into the image.
- Vercel crons are mirrored with a plain `crontab` on the VPS that curls the
  local `/api/cron/send-notifications` with `CRON_SECRET`.

## 1. One-time: GitHub repo secrets

The workflow needs the same env Vercel has. In repo → Settings → Secrets and
variables → Actions, add: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_APP_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
`NOTIFICATION_EMAIL_FROM`, `CRON_SECRET`.

## 2. One-time: VPS setup (any provider, ~$5–8/mo)

This is a one-off shell session. Then create `support/fallback/.env` on the
server (copy the values from Vercel env vars — same names, plus `NEXT_PUBLIC_APP_URL`).

```bash
# install docker + compose plugin (Debian/Ubuntu example)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# allow pulling the private image
echo "$GITHUB_TOKEN" | docker login ghcr.io -u <your-github-username> --password-stdin
```

> The token can be a classic PAT with `read:packages` scope. Give it to the
> server only (don't commit it).

## 3. Deploy the stack

```bash
git clone https://github.com/Kuhwin/Wahwedoin.git
cd Wahwedoin/support/fallback
cp .env.example .env      # fill in real values
docker compose pull
docker compose up -d
docker compose ps         # healthy?
```

`docker-compose.yml` runs the app on `localhost:3000` and Caddy in front of it.
The `Caddyfile` uses a placeholder domain — replace it (or use the IP with a
temporary cert) once you own the domain. Caddy auto-provisions TLS.

## 4. Mirror the notification cron

The Vercel cron runs Mon/Thu 08:00. On the VPS:

```bash
crontab -e
# 0 8 * * 1,4 curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/send-notifications >/dev/null 2>&1
```

(Replace `$CRON_SECRET` with the real value; crontab doesn't expand it.)

## 5. Allow the fallback URL in auth redirects

Both auth providers whitelist callback URLs. Add the fallback origin so login
works there:

- **Supabase Auth**: Dashboard → Authentication → URL Configuration → Add to
  redirect URLs: `https://<fallback-url>/auth/callback`
- **Google OAuth**: Google Cloud Console → the Wahwedoin OAuth client →
  Authorized redirect URIs: `https://<fallback-url>/auth/callback` (and the
  `link` callback if used). Easy to add now because the app is still in
  Testing mode; if it's published later, you may need a quick re-verification.

## 6. Cut over (during an outage)

1. Confirm the fallback monitor is green while production is red (`runbook.md`).
2. Tell the team to use `https://<fallback-url>` (in-app `/status` shows the
   link; put it on the public status page too).
3. Sign-in options: email/password and magic link always work. Google OAuth
   works on the fallback only if the redirect URI was added in step 5.
4. When production recovers: verify `/api/health` is green, then switch back.
   Nothing to migrate — both hosts share the same database.

## 7. When you own the domain (future)

- Move the Caddyfile to `https://wahwedoin.com` (the real domain) and make the
  fallback a subdomain.
- Point the app's primary DNS at Vercel and add a manual fallback record so
  DNS cutover is fast (TTL as low as possible).
- Finish Google OAuth verification + publish (the remaining prod-hardening item).

## Verification checklist

- [ ] `docker compose ps` shows `healthy` (Docker HEALTHCHECK hits `/api/health`)
- [ ] `curl https://<fallback-url>/api/health` → 200
- [ ] Fallback monitor exists in the uptime provider (`monitoring.md`)
- [ ] Supabase + Google redirect URLs include the fallback origin
- [ ] Log in on the fallback URL with email/password and with Google
- [ ] Create a task and confirm it appears on production (shared DB)

## Costs & limits

- VPS: ~$5–8/mo. GHCR storage: free tier is plenty for one image.
- Updates land automatically via CI on every push to `main`; pull on the VPS
  to apply (or add a `watchtower` container later).
- Single-instance, no redundancy of its own — it's a standby, not a HA cluster.
