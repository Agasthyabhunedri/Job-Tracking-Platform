import { Request, Response, NextFunction } from "express";
import { createHmac } from "crypto";

export interface AuthRequest extends Request {
  userId?: number;
}

export function makeToken(userId: number): string {
  const payload = Buffer.from(JSON.stringify({ userId, iat: Date.now() })).toString("base64url");
  const secret = process.env.SESSION_SECRET ?? "dev-secret";
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): number | null {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const secret = process.env.SESSION_SECRET ?? "dev-secret";
    const expected = createHmac("sha256", secret).update(payload).digest("base64url");
    if (sig !== expected) return null;
    const { userId } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof userId === "number" ? userId : null;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  const userId = verifyToken(token);
  if (!userId) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  req.userId = userId;
  next();
}
