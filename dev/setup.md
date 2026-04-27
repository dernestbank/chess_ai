# BoardSight Setup (Expo Go + Android + Coolify)

This guide is the fastest path to run the app on your Android phone with Expo Go while hosting the backend on your Ubuntu home server via Coolify.

## 1) What you will run

- **Phone app:** Expo Go on Android
- **Backend:** FastAPI + worker + Postgres + Redis from `backend/docker-compose.yml`
- **Hosting:** Coolify on Ubuntu with a public HTTPS URL (recommended)

---

## 2) Prerequisites

### Local machine (Windows dev PC)

- Node.js 20+ and npm
- Android phone with **Expo Go** installed
- Git access to this repo

### Ubuntu server (Coolify host)

- Coolify installed on the machine that will run the stack
- **Either** a public DNS name that points to your home IP **with** ports 80/443 forwarded **or** (recommended for home) a **Cloudflare Tunnel** so you do **not** need to expose router ports — see **§2.5** below
- `orchville.com` managed in Cloudflare (for tunnel + DNS)

---

## 2.5 Cloudflare Tunnel — `chessai.orchville.com` → home Linux (Coolify)

Use this when `orchville.com` is on Cloudflare and you want **`https://chessai.orchville.com`** to reach Coolify on your Linux box **without** opening 80/443 on your router.

### A) Create the tunnel (Cloudflare dashboard)

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com) → select **orchville.com** if needed.
2. Go to **Zero Trust** (sometimes **Cloudflare One** in the left nav) → **Networks** → **Tunnels**.
3. **Create a tunnel** → choose **Cloudflared** → name it (e.g. `home-coolify`) → **Save tunnel**.
4. **Install and run a connector** on your **Linux home server** using the command Cloudflare shows (uses a **token** — treat it like a secret). Prefer the **Linux** **systemd** service instructions so the tunnel survives reboot.

### B) Public hostname (route subdomain to Coolify)

Still under the tunnel → **Public Hostname** → **Add a public hostname**:

| Field | Example |
|--------|--------|
| **Subdomain** | `chessai` |
| **Domain** | `orchville.com` |
| **Service type** | `HTTP` (typical) |
| **URL** | `http://127.0.0.1:80` **or** `http://127.0.0.1:443` — see below |

**Choosing the URL**

- Coolify usually terminates TLS and listens on **80/443** on the host. The tunnel must forward to the **same port** your browser would use **on the server itself** when you open Coolify’s proxy.
- Start with **`http://127.0.0.1:80`**. If nothing answers, try **`https://127.0.0.1:443`** and enable **“No TLS Verify”** for that origin in the hostname’s **Additional application settings** (only for localhost).
- After you add the app in Coolify, set the resource **FQDN** to **`chessai.orchville.com`** so the proxy routes by **Host** header. The tunnel only forwards traffic to localhost; Coolify decides which container gets the request.

Cloudflare will create the **DNS** record (usually a **CNAME** to `*.cfargotunnel.com`). Do **not** add a second conflicting `A`/`CNAME` for `chessai` on another origin.

### C) SSL mode (dashboard → orchville.com → SSL/TLS)

For tunneled origins, **Full** or **Full (strict)** is common. Avoid **Flexible** if the origin expects HTTPS.

### D) Coolify + env (use this hostname everywhere)

1. In Coolify, set the application domain to **`https://chessai.orchville.com`** (and issue/attach certs if Coolify manages TLS for that name — often it works behind the tunnel when the public name matches).
2. Set **`CORS_ALLOWED_ORIGINS`** to include your real origins, e.g.  
   `https://chessai.orchville.com,https://expo.dev,http://localhost:8081,http://localhost:19006`
3. In the mobile app `.env`:  
   **`EXPO_PUBLIC_API_BASE_URL=https://chessai.orchville.com`**

**WebSocket relay:**  
`wss://chessai.orchville.com/ws/relay/<CODE>?role=host&api_key=...` when `API_AUTH_ENABLED=true`.

### E) Quick checks

```powershell
curl https://chessai.orchville.com/health
curl https://chessai.orchville.com/health/ready
curl https://chessai.orchville.com/openapi.yaml
```

If these fail, verify **cloudflared** is active on the server, the **public hostname** URL/port matches Coolify, and the Coolify resource domain is **`chessai.orchville.com`**.

---

## 3) Deploy backend on Coolify

## 3.1 Create resource

1. In Coolify, create a new application from this git repo.
2. Set the deployment **Git branch** to **`server`** (see `dev/git-branches.md`) if you use the server/app split; otherwise use **`main`**.
3. Set the app root (or compose location) to `backend/`.
4. Use `backend/docker-compose.yml` as the deployment definition.
5. Attach domain **`chessai.orchville.com`** (matching the tunnel hostname) and enable HTTPS per Coolify’s workflow.

## 3.2 Set environment variables

Set these in Coolify (adapt values as needed):

- `DATABASE_URL=postgresql://boardsight:boardsight@postgres:5432/boardsight`
- `REDIS_URL=redis://redis:6379/0`
- `STOCKFISH_PATH=/usr/games/stockfish`
- `ANTHROPIC_API_KEY=` (optional for commentary/takeaways)
- `API_AUTH_ENABLED=true`
- `BOARD_API_KEY=<strong-random-key>`
- `CORS_ALLOWED_ORIGINS=https://chessai.orchville.com,https://expo.dev,http://localhost:8081,http://localhost:19006`

If you are still in quick testing mode and auth gets in the way:

- `API_AUTH_ENABLED=false`

**Cloud relay WebSocket:** When `API_AUTH_ENABLED=true`, clients must pass the same secret as REST. Either append `api_key=<BOARD_API_KEY>` to the WebSocket URL (for example `wss://chessai.orchville.com/ws/relay/ABC123?role=host&api_key=...`) or send header `X-API-Key` on the upgrade; a missing or wrong key closes the socket with code `4003`.

**Production note:** The relay keeps sessions **in memory** on each API process. Run **one API replica** for a given deployment (or accept that multi-replica setups won’t share rooms until you add shared state).

## 3.3 Deploy and verify

After deploy completes, test:

- `https://chessai.orchville.com/health` should return status `ok`
- `https://chessai.orchville.com/health/ready` should be `ready` (or `degraded` if DB/Redis not healthy)

PowerShell example:

```powershell
curl https://chessai.orchville.com/health
curl https://chessai.orchville.com/health/ready
```

---

## 4) Run Expo app locally

> Note: this repo snapshot may not currently include the Expo app files.  
> If your mobile app lives in another folder, run these commands there.

1. Go to your Expo app directory (the one with `package.json`).
2. Install dependencies:

```powershell
npm install
```

3. Create/update `.env` in the Expo app with backend values:

```env
EXPO_PUBLIC_API_BASE_URL=https://chessai.orchville.com
EXPO_PUBLIC_API_KEY=<same BOARD_API_KEY from Coolify>
```

4. Start Expo:

```powershell
npx expo start
```

5. In Expo Go on Android:
   - Make sure phone and PC are on the same network (LAN mode), or use tunnel mode.
   - Scan the QR code from terminal/browser.

If LAN fails due to network isolation, use:

```powershell
npx expo start --tunnel
```

---

## 5) Basic end-to-end test

1. Launch app in Expo Go.
2. Trigger an analysis flow from the app.
3. Confirm backend receives request and returns job status/result.
4. In Coolify logs, verify:
   - API container receives `/v1/analysis/jobs`
   - Worker processes queue jobs
5. Optional quick API test with auth header:

```powershell
$headers = @{ "X-API-Key" = "<your key>" }
$body = @{
  pgn = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0"
  depth = 10
  include_llm_takeaways = $false
} | ConvertTo-Json

curl https://chessai.orchville.com/v1/analysis/jobs `
  -Method POST `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

---

## 6) Troubleshooting

- **401 Invalid or missing API key**
  - Ensure `API_AUTH_ENABLED` and `BOARD_API_KEY` match app `.env` values.
- **`/health/ready` is degraded**
  - Check Postgres/Redis container status and env URLs.
- **Expo Go cannot load app**
  - Try `npx expo start --tunnel`.
  - Confirm local firewall allows Node/Expo traffic.
- **Android network errors**
  - Use HTTPS backend URL (avoid cleartext HTTP on Android where possible).
- **No worker results**
  - Confirm worker container is running and connected to Redis/Postgres.

---

## 7) Recommended next step

Once this is stable, add a small `/.well-known/health` or uptime monitor and set a daily backup policy for Postgres on the server.

