import { Router } from "express";
import { createHash } from "crypto";
import { db, usersTable, subscriptionsTable, notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { makeToken, requireAuth, type AuthRequest } from "../middlewares/auth";
import { RegisterBody, LoginBody } from "@workspace/api-zod";

const router = Router();

function hashPassword(pw: string): string {
  return createHash("sha256").update(pw + "salt-jobflow").digest("hex");
}

router.post("/auth/register", async (req, res) => {
  const parse = RegisterBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { email, password, name } = parse.data;
  try {
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    const [user] = await db.insert(usersTable).values({
      email,
      name,
      passwordHash: hashPassword(password),
    }).returning();
    await db.insert(subscriptionsTable).values({
      userId: user.id,
      planId: "free",
      planName: "Free",
      status: "active",
      currentPeriodEnd: null,
    });
    await db.insert(notificationsTable).values({
      userId: user.id,
      type: "welcome",
      title: "Welcome to JobFlow!",
      message: "Start tracking your job applications and unlock powerful insights.",
      read: false,
    });
    const token = makeToken(user.id);
    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt } });
  } catch (err) {
    req.log.error({ err }, "Registration error");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/auth/login", async (req, res) => {
  const parse = LoginBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { email, password } = parse.data;
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user || user.passwordHash !== hashPassword(password)) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = makeToken(user.id);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt } });
  } catch (err) {
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/auth/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
    if (!user) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: user.id, email: user.email, name: user.name, createdAt: user.createdAt });
  } catch (err) {
    req.log.error({ err }, "getMe error");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
