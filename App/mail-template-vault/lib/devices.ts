export function deviceDetails(userAgent: string) {
  const ua = userAgent || "Unknown";
  const browser = /Edg\//.test(ua) ? "Microsoft Edge" : /OPR\//.test(ua) ? "Opera" :
    /Chrome\//.test(ua) ? "Google Chrome" : /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" : "Unknown browser";
  const system = /Windows NT 10/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" :
    /iPhone|iPad/.test(ua) ? "iOS/iPadOS" : /Mac OS X/.test(ua) ? "macOS" :
    /Linux/.test(ua) ? "Linux" : "Unknown system";
  return { browser, system };
}

export function sessionStatus(session: { revokedAt: string|null; loggedOutAt: string|null; expiresAt: string }) {
  if (session.revokedAt) return "Removed";
  if (session.loggedOutAt) return "Logged out";
  if (new Date(session.expiresAt).getTime() <= Date.now()) return "Inactive";
  return "Active";
}
