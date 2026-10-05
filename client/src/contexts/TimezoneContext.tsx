import { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { getAuthHeaders } from "@/lib/api";
import { useStore } from "@/lib/store";
import { isValidTimeZone } from "@shared/timezone";

const DEFAULT_TZ = "America/New_York";

type TimezoneContextValue = {
  timezone: string;
  updateTimezone: (timezone: string) => void;
};

const TimezoneContext = createContext<TimezoneContextValue>({
  timezone: DEFAULT_TZ,
  updateTimezone: () => {},
});

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [tz, setTz] = useState<string>(DEFAULT_TZ);
  const authToken = useStore((state) => state.currentUser?.auth_token);

  useEffect(() => {
    let active = true;
    if (!authToken) {
      setTz(DEFAULT_TZ);
      return () => { active = false; };
    }

    fetch("/api/settings/company-timezone", { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && typeof data?.timezone === "string" && isValidTimeZone(data.timezone)) {
          setTz(data.timezone);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [authToken]);

  const updateTimezone = useCallback((timezone: string) => {
    if (isValidTimeZone(timezone)) setTz(timezone);
  }, []);
  const value = useMemo(() => ({ timezone: tz, updateTimezone }), [tz, updateTimezone]);
  return (
    <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>
  );
}

export function useTimezone(): string {
  return useContext(TimezoneContext).timezone;
}

export function useUpdateTimezone(): (timezone: string) => void {
  return useContext(TimezoneContext).updateTimezone;
}
