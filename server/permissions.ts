import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

export function hasPermission(permStrings: string[], module: string, action: string): boolean {
  return permStrings.includes(`${module}:${action}`);
}

export function requirePermission(module: string, action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId as number | undefined;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      if (user.role === "admin") return next(); // system admin bypasses all checks
      const perms = await storage.getUserPermissionStrings(userId);
      if (!hasPermission(perms, module, action)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      next();
    } catch {
      res.status(500).json({ error: "Permission check failed" });
    }
  };
}

// Allows system admin OR any user who has admin:view permission
export function requireAdminAccess() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId as number | undefined;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      if (user.role === "admin") return next();
      const perms = await storage.getUserPermissionStrings(userId);
      if (perms.includes("admin:view")) return next();
      res.status(403).json({ error: "Forbidden" });
    } catch {
      res.status(500).json({ error: "Permission check failed" });
    }
  };
}
