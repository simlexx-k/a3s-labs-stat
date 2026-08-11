import { createRemoteJWKSet, jwtVerify } from "jose";

export type AccessIdentity = {
  email: string;
  subject: string | null;
  expiresAt: number | null;
  issuedAt: number | null;
};

export type AccessAuthResult =
  | { ok: true; identity: AccessIdentity; developmentBypass: boolean }
  | { ok: false; status: 401 | 403 | 503; error: string; code: string };

type AccessConfig =
  | { mode: "development-bypass" }
  | { mode: "configured"; issuer: string; audience: string }
  | { mode: "invalid" };

let cachedIssuer: string | null = null;
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function accessConfig(): AccessConfig {
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audience = process.env.CF_ACCESS_AUD?.trim();

  if (!teamDomain && !audience && process.env.NODE_ENV !== "production") {
    return { mode: "development-bypass" };
  }

  if (!teamDomain || !audience) {
    return { mode: "invalid" };
  }

  try {
    const url = new URL(teamDomain);
    if (url.protocol !== "https:") return { mode: "invalid" };
    return { mode: "configured", issuer: url.origin, audience };
  } catch {
    return { mode: "invalid" };
  }
}

function accessJwks(issuer: string) {
  if (!cachedJwks || cachedIssuer !== issuer) {
    cachedIssuer = issuer;
    cachedJwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  }
  return cachedJwks;
}

export async function authenticateCloudflareAccess(request: Request): Promise<AccessAuthResult> {
  const config = accessConfig();

  if (config.mode === "development-bypass") {
    return {
      ok: true,
      identity: { email: "local-development@localhost", subject: null, expiresAt: null, issuedAt: null },
      developmentBypass: true,
    };
  }

  if (config.mode === "invalid") {
    return {
      ok: false,
      status: 503,
      error: "Authentication service unavailable",
      code: "access_not_configured",
    };
  }

  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) {
    return { ok: false, status: 401, error: "Authentication required", code: "access_token_missing" };
  }

  try {
    const { payload } = await jwtVerify(token, accessJwks(config.issuer), {
      audience: config.audience,
      issuer: config.issuer,
    });
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";

    if (!email) {
      return { ok: false, status: 403, error: "Access denied", code: "access_identity_missing" };
    }

    return {
      ok: true,
      identity: {
        email,
        subject: typeof payload.sub === "string" ? payload.sub : null,
        expiresAt: typeof payload.exp === "number" ? payload.exp : null,
        issuedAt: typeof payload.iat === "number" ? payload.iat : null,
      },
      developmentBypass: false,
    };
  } catch {
    return { ok: false, status: 403, error: "Access denied", code: "access_token_invalid" };
  }
}
