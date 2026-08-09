# A3S Labs Stat

A VPS, Docker, and container stats dashboard with a Robyn backend and a Next.js frontend.

## Features

- VPS hostname, OS, kernel, uptime, boot time, CPU, memory, disk, and network counters.
- Docker daemon status, version, image/container counts, and running container stats.
- Per-container CPU, memory, network, block I/O, status, image, ports, and labels.
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

The backend container mounts `/var/run/docker.sock` read-only so it can inspect Docker. Treat access to the Docker socket as privileged and only run this dashboard where trusted users can access it.

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

### 3. Deploy the frontend on Vercel

Import the GitHub repo in Vercel and set the project root directory to:

```text
web-app
```

Set this Vercel environment variable:

```text
TELEMETRY_API_URL=https://stats-api-robyn.a3slabs.co.ke/api
```

`TELEMETRY_API_URL` is read only by the Next.js server and is not included in browser bundles. After changing it, redeploy the web app.

The web app no longer requires cross-origin browser access to the backend. `CORS_ORIGIN` can remain restricted to a trusted origin, but CORS is not authentication; protect the Cloudflare endpoint with appropriate access controls if the telemetry is sensitive.

To change the allowed browser origin, update the backend environment and restart it:

```yaml
CORS_ORIGIN: https://istatus.a3slabs.co.ke
```
