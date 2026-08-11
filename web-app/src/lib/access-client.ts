"use client";

let accessRecoveryStarted = false;

export class AccessSessionExpiredError extends Error {
  constructor() {
    super("Cloudflare Access session expired");
    this.name = "AccessSessionExpiredError";
  }
}

export function isAccessSessionExpired(error: unknown): error is AccessSessionExpiredError {
  return error instanceof AccessSessionExpiredError;
}

function resumeAccessSession() {
  if (accessRecoveryStarted || typeof window === "undefined") return;
  accessRecoveryStarted = true;

  // Authentication redirects must be top-level navigations; fetch cannot follow
  // the cross-origin Cloudflare Access login page because of browser CORS rules.
  window.location.assign(window.location.href);
}

export async function accessFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (accessRecoveryStarted) throw new AccessSessionExpiredError();

  const response = await fetch(input, { ...init, redirect: "manual" });
  if (response.type === "opaqueredirect") {
    resumeAccessSession();
    throw new AccessSessionExpiredError();
  }

  return response;
}

export async function verifyAccessSession() {
  try {
    const response = await accessFetch("/api/session", { cache: "no-store" });
    if (response.status === 401) resumeAccessSession();
  } catch (error) {
    if (!isAccessSessionExpired(error)) return;
  }
}
