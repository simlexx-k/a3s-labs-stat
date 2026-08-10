# A3S Labs Stat

A VPS, Docker, and container stats dashboard with a Robyn backend and a Next.js frontend.

## Features

- VPS hostname, OS, kernel, uptime, boot time, CPU, memory, disk, and network counters.
- Docker daemon status, version, image/container counts, and running container stats.
- Per-container CPU, memory, network, block I/O, status, image, ports, and labels.
- Per-container stdout/stderr logs with search, stream/severity/time filters, bounded polling, follow/wrap controls, and text, JSON, or CSV export.
- Responsive dashboard with auto-refresh and API health state.

## Local Development

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app/main.py --dev
```

The web app requires Node.js 20.9+ locally. The included Dockerfile uses Node 22.

```bash
cd web-app
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

## Docker Compose

```bash
docker compose up --build
```

The web app runs on `http://localhost:3000`. Browsers request same-origin telemetry from `/api/stats`; the Next.js server proxies those requests to the backend using the server-only `TELEMETRY_API_URL` environment variable.

Container logs are available from each workload row. The browser requests the authenticated same-origin `/api/containers/:id/logs` route, and the Next.js server proxies it to the backend. Each request is limited to 5,000 lines and log responses are never cached. Exports are generated locally from the currently visible filtered rows.

The backend container mounts `/var/run/docker.sock` read-only so it can inspect Docker. Treat access to the Docker socket as privileged and only run this dashboard where trusted users can access it. Port `8080` is bound to VPS loopback so it is available to `cloudflared` without being published on the VPS public interfaces.

Production authentication requires these values in the Compose `.env` file:

```bash
CF_ACCESS_TEAM_DOMAIN=https://your-team.cloudflareaccess.com
CF_ACCESS_AUD=your-dashboard-application-audience
CF_ACCESS_CLIENT_ID=your-backend-service-token-client-id
CF_ACCESS_CLIENT_SECRET=your-backend-service-token-secret
```

## GitHub, Vercel, and Cloudflare Tunnel Deployment

### 1. Publish to GitHub

This directory can be pushed to a new GitHub repo and then connected to Vercel. From this VPS, install/authenticate GitHub tooling or add a remote manually:

```bash
git init
git add .
git commit -m "Initial VPS stats dashboard"
git branch -M main
git remote add origin git@github.com:YOUR_USER_OR_ORG/a3s-labs-stat.git
git push -u origin main
```

If you use HTTPS instead of SSH, use the HTTPS remote from GitHub and authenticate with a GitHub token.

### 2. Route the backend with Cloudflare Tunnel

Create a Cloudflare Tunnel in Cloudflare Zero Trust and add a public hostname, for example:

```text
stats-api.yourdomain.com -> http://localhost:8080
```

Then create `.env` from `.env.example` and set the token:

```bash
cp .env.example .env
# edit CLOUDFLARE_TUNNEL_TOKEN
docker compose --profile tunnel up -d --build
```

The tunnel service runs with host networking so it can reach Cloudflare reliably on this VPS and route to the Robyn API at `http://localhost:8080`. This exposes the backend through Cloudflare without opening port `8080` to the public internet.

Create a Cloudflare Access self-hosted application for the backend hostname and
attach a Service Auth policy that accepts only the service token configured on
the Next.js server.

### 3. Deploy the frontend on Vercel

Import the GitHub repo in Vercel and set the project root directory to:

```text
web-app
```

Set these Vercel environment variables:

```text
TELEMETRY_API_URL=https://stats-api-robyn.a3slabs.co.ke/api
CF_ACCESS_TEAM_DOMAIN=https://your-team.cloudflareaccess.com
CF_ACCESS_AUD=your-dashboard-application-audience
CF_ACCESS_CLIENT_ID=your-backend-service-token-client-id
CF_ACCESS_CLIENT_SECRET=your-backend-service-token-secret
```

These variables are read only by the Next.js server and are not included in browser bundles. After changing them, redeploy the web app.

### 4. Require email OTP for the dashboard

In Cloudflare Zero Trust, add One-Time PIN as an identity provider. Create a
self-hosted Access application covering `istatus.a3slabs.co.ke/*`, choose OTP as
its only login method, and allow only explicit email addresses. Copy that
application's Audience (AUD) tag into `CF_ACCESS_AUD`.

Cloudflare handles the login and OTP email. The Next.js app independently
validates the Access JWT on page and API requests, and production fails closed
if the Access configuration is absent. OTP codes and user passwords are never
stored by this repository.

The web app no longer requires cross-origin browser access to the backend. `CORS_ORIGIN` can remain restricted to a trusted origin, but CORS is not authentication; protect the Cloudflare endpoint with appropriate access controls if the telemetry is sensitive.

To change the allowed browser origin, update the backend environment and restart it:

```yaml
CORS_ORIGIN: https://istatus.a3slabs.co.ke
```
