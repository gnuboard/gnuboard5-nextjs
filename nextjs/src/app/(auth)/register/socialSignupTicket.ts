/**
 * Social-signup ticket persistence — extracted from register/page.tsx.
 *
 * Bridges the short-lived social-signup ticket across a page reload during
 * signup. Pure storage/time logic (no React); kept resilient to private or
 * restricted browser contexts where storage may throw.
 */

const SOCIAL_SIGNUP_TICKET_STORAGE_KEY = "g5_social_signup_ticket";
const SOCIAL_SIGNUP_TICKET_MAX_AGE_MS = 9 * 60 * 1000;

function parseStoredSocialSignupTicket(raw: string | null): string {
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw) as { ticket?: unknown; stored_at?: unknown };
    const ticket = typeof parsed.ticket === "string" ? parsed.ticket : "";
    const storedAt = typeof parsed.stored_at === "number" ? parsed.stored_at : 0;

    if (!ticket) return "";
    if (storedAt > 0 && Date.now() - storedAt > SOCIAL_SIGNUP_TICKET_MAX_AGE_MS) {
      return "";
    }

    return ticket;
  } catch {
    return raw;
  }
}

function createStoredSocialSignupTicket(ticket: string): string {
  return JSON.stringify({
    ticket,
    stored_at: Date.now(),
  });
}

export function readStoredSocialSignupTicket(): string {
  if (typeof window === "undefined") return "";
  try {
    const sessionTicket = parseStoredSocialSignupTicket(
      sessionStorage.getItem(SOCIAL_SIGNUP_TICKET_STORAGE_KEY)
    );
    if (sessionTicket) return sessionTicket;
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }

  try {
    localStorage.removeItem(SOCIAL_SIGNUP_TICKET_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }

  clearStoredSocialSignupTicket();
  return "";
}

export function storeSocialSignupTicket(ticket: string) {
  if (typeof window === "undefined" || !ticket) return;
  const value = createStoredSocialSignupTicket(ticket);
  try {
    sessionStorage.setItem(SOCIAL_SIGNUP_TICKET_STORAGE_KEY, value);
  } catch {
    // The current page load can still continue with the ticket from the URL.
  }
  try {
    localStorage.removeItem(SOCIAL_SIGNUP_TICKET_STORAGE_KEY);
  } catch {
    // The current page load can still continue with the session-scoped ticket.
  }
}

export function clearStoredSocialSignupTicket() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SOCIAL_SIGNUP_TICKET_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
  try {
    localStorage.removeItem(SOCIAL_SIGNUP_TICKET_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
}
