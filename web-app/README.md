# A3S Infrastructure Console

Next.js frontend for live host and Docker telemetry.

## Local development

Create the local environment file, start the backend, then run:

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. The browser requests telemetry from the same-origin
`/api/stats` route. Next.js proxies that request to the backend, so the backend
origin is never included in the client bundle or displayed in the interface.

## Backend configuration

The proxy requires the server-only variable below in every environment:

```bash
TELEMETRY_API_URL=https://stats-api.example.com/api
```

Do not prefix this variable with `NEXT_PUBLIC_`; doing so would expose its value
to browser code. On Vercel, configure `TELEMETRY_API_URL` as a project environment
variable and redeploy.

## Checks

```bash
npm run lint
npm run build
npm run test:e2e
```
