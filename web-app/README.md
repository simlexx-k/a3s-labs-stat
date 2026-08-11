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

Cloudflare Access authentication is bypassed only under `next dev` when both
`CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are empty. Production deployments
fail closed when either variable is missing.

## Backend configuration

The proxy requires the server-only variable below in every environment:

```bash
TELEMETRY_API_URL=https://stats-api-robyn.a3slabs.co.ke/api
```

Do not prefix this variable with `NEXT_PUBLIC_`; doing so would expose its value
to browser code. On Vercel, configure `TELEMETRY_API_URL` as a project environment
variable and redeploy.

## Authentication

Authentication is provided by Cloudflare Access with email One-Time PIN (OTP).
The application does not store passwords, OTPs, or browser sessions.

Create a Cloudflare Access self-hosted application for
`istatus.a3slabs.co.ke`, select One-Time PIN as its only login method, and add an
Allow policy containing the specific email addresses that may use the console.
Do not allow `Everyone` or all users of the OTP login method.

Copy the application's Audience (AUD) tag and configure these server-only
variables in Vercel or Docker Compose:

```bash
CF_ACCESS_TEAM_DOMAIN=https://your-team.cloudflareaccess.com
CF_ACCESS_AUD=your-dashboard-application-audience
```

Cloudflare adds a `Cf-Access-Jwt-Assertion` header after OTP authentication.
Next.js validates its signature, issuer, audience, expiry, and email claim on
every protected request. This also rejects requests made directly to the Vercel
deployment URL without passing through Cloudflare Access.

Protected browser requests detect Cloudflare Access login redirects without
following them as cross-origin fetches. When the Access cookie expires, the
console performs a top-level navigation to the current page so Cloudflare can
reauthenticate the user and return them to the requested screen.

The persistent sign-out control links to `/logout`, which redirects to the
application-domain Cloudflare Access logout endpoint. Cloudflare clears the
application authorization cookie immediately and revokes the user's Access
session across protected applications.

### Backend service authentication

Create a second Cloudflare Access application for
`stats-api-robyn.a3slabs.co.ke`. Give it a Service Auth policy that accepts only
a dedicated service token. Store that token in server-only variables:

```bash
CF_ACCESS_CLIENT_ID=your-service-token-client-id
CF_ACCESS_CLIENT_SECRET=your-service-token-secret
TELEMETRY_WRITE_TOKEN=the-same-random-value-configured-on-the-backend
ISTATUS_OPERATOR_EMAILS=operator1@example.com,operator2@example.com
ISTATUS_ADMIN_EMAILS=admin@example.com
```

The `/api/stats` route adds these credentials only to its server-side upstream
request. They are never sent to the browser. Both values must be configured
together. They may remain empty when the frontend reaches Robyn directly over
the private Docker Compose network.

## Checks

```bash
npm run lint
npm run build
npm run test:e2e
```
