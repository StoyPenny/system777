import { UserProfile } from "@/types";

const SESSION_KEY = "s777_user";

export function saveSession(user: UserProfile) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function loadSession(): UserProfile | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
