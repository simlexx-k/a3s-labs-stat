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

Frontend requires Node.js 20.9+ locally. The included Dockerfile uses Node 22.

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Docker Compose

```bash
docker compose up --build
```

The frontend runs on `http://localhost:3000`. In local Docker mode it derives the API URL from the browser host and calls `http://<host>:8080/api`; in Vercel set `NEXT_PUBLIC_API_BASE_URL` to the Cloudflare Tunnel API URL.

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
frontend
```

Set this Vercel environment variable:

```text
NEXT_PUBLIC_API_BASE_URL=https://stats-api.yourdomain.com/api
```

After deployment, set `CORS_ORIGIN` on the backend to your Vercel domain for stricter CORS, then restart the backend:

```yaml
CORS_ORIGIN: https://your-vercel-app.vercel.app
```

For initial testing, the compose file uses `CORS_ORIGIN: "*"`. Lock it down once the Vercel URL is known.
