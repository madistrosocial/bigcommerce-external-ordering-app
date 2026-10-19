import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";

export const securityHeadersAndErrorRedaction: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    if (res.statusCode >= 500) {
      return originalJson({ error: "Internal server error" });
    }
    return originalJson(body);
  }) as typeof res.json;
  next();
};

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again later." },
});

export const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset attempts. Try again later." },
});
