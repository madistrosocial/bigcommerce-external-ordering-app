export const AUTH_SESSION_EXPIRED_EVENT = "vansales:auth-session-expired";

const INSTALL_FLAG = "__vansalesAuthSessionMonitorInstalled";

type MonitoredWindow = Window & { [INSTALL_FLAG]?: boolean };

function isCurrentAppSessionRequest(url: URL, authorization: string | null): boolean {
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return false;
  if (url.pathname === "/api/auth/logout" || !authorization) return false;

  try {
    const user = JSON.parse(localStorage.getItem("vansales_user") || "null");
    return typeof user?.auth_token === "string"
      && authorization === `Bearer ${user.auth_token}`;
  } catch {
    return false;
  }
}

export function installAuthSessionMonitor(): void {
  const monitoredWindow = window as MonitoredWindow;
  if (monitoredWindow[INSTALL_FLAG]) return;
  monitoredWindow[INSTALL_FLAG] = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    let url: URL | null = null;
    try {
      url = new URL(request?.url ?? String(input), window.location.origin);
    } catch {
      // Leave non-URL fetch inputs to the browser's normal fetch error handling.
    }

    const headers = new Headers(request?.headers);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    const response = await originalFetch(input, init);

    if (response.status === 401 && url && isCurrentAppSessionRequest(url, headers.get("authorization"))) {
      window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
    }
    return response;
  };
}
