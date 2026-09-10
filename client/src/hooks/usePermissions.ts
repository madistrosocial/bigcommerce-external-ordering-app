import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/store";
import * as api from "@/lib/api";

export function usePermissions() {
  const { currentUser } = useStore();

  const { data: permStrings = [], isLoading } = useQuery({
    queryKey: ["user-permissions", currentUser?.id],
    queryFn: api.getMyPermissions,
    enabled: !!currentUser,
    staleTime: 60_000,
  });

  function hasPermission(module: string, action: string = "view"): boolean {
    // System admins always have full access — skip permission checks
    if (currentUser?.role === "admin") return true;
    // All other users need an explicit permission grant
    const hasAttendanceModuleAccess =
      module !== "attendance" || action === "view" || permStrings.includes("attendance:view");
    return hasAttendanceModuleAccess && permStrings.includes(`${module}:${action}`);
  }

  return { hasPermission, permStrings, isLoading };
}

export const DROPSHIPPING_PERMISSION = { key: "dropshipping", label: "Dropshipping" };
