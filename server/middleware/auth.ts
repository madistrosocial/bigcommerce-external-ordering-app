import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.headers["x-user-id"];

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await storage.getUser(Number(userId));

  if (!user || !user.is_enabled) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  (req as any).user = user;
  next();
}

export function requireRole(role: "admin" | "agent") {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user || user.role !== role) {
      return res.status(403).json({ error: "Forbidden" });
    }

    next();
  };
}
