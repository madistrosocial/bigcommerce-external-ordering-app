import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getAuthHeaders } from "@/lib/api";

const DEFAULT_TZ = "America/New_York";

const TimezoneContext = createContext<string>(DEFAULT_TZ);

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [tz, setTz] = useState<string>(DEFAULT_TZ);

  useEffect(() => {
    fetch("/api/settings/company-timezone", { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.timezone) setTz(data.timezone);
      })
      .catch(() => {});
  }, []);

  return (
    <TimezoneContext.Provider value={tz}>{children}</TimezoneContext.Provider>
  );
}

export function useTimezone(): string {
  return useContext(TimezoneContext);
}
