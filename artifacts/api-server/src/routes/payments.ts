import { Router } from "express";
import { db, subscriptionsTable, billingHistoryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { UpdateSubscriptionBody } from "@workspace/api-zod";

const router = Router();

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    interval: "month",
    applicationLimit: 10,
    popular: false,
    features: ["Up to 10 applications", "Basic analytics", "Email notifications", "Company tracking"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 9.99,
    interval: "month",
    applicationLimit: null,
    popular: true,
    features: ["Unlimited applications", "Advanced analytics", "AI recommendations", "Priority support", "Export data", "Interview tracking"],
  },
  {
    id: "premium",
    name: "Premium",
    price: 19.99,
    interval: "month",
    applicationLimit: null,
    popular: false,
    features: ["Everything in Pro", "AI-powered resume analysis", "Custom pipelines", "API access", "Team sharing", "Dedicated support"],
  },
];

router.get("/payments/plans", (_req, res) => {
  res.json(PLANS);
});

router.get("/payments/subscription", requireAuth, async (req: AuthRequest, res) => {
  try {
    let [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, req.userId!)).limit(1);
    if (!sub) {
      [sub] = await db.insert(subscriptionsTable).values({
        userId: req.userId!,
        planId: "free",
        planName: "Free",
        status: "active",
        currentPeriodEnd: null,
      }).returning();
    }
    res.json({
      id: sub.id,
      planId: sub.planId,
      planName: sub.planName,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? new Date(Date.now() + 30 * 86400000).toISOString(),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    });
  } catch (err) {
    req.log.error({ err }, "getSubscription error");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/payments/subscription", requireAuth, async (req: AuthRequest, res) => {
  const parse = UpdateSubscriptionBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const plan = PLANS.find(p => p.id === parse.data.planId);
  if (!plan) { res.status(400).json({ error: "Invalid plan" }); return; }
  try {
    const periodEnd = new Date(Date.now() + 30 * 86400000);
    const [sub] = await db
      .insert(subscriptionsTable)
      .values({
        userId: req.userId!,
        planId: plan.id,
        planName: plan.name,
        status: "active",
        currentPeriodEnd: periodEnd,
      })
      .onConflictDoUpdate({
        target: subscriptionsTable.userId,
        set: { planId: plan.id, planName: plan.name, status: "active", currentPeriodEnd: periodEnd, updatedAt: new Date() },
      })
      .returning();
    if (plan.price > 0) {
      await db.insert(billingHistoryTable).values({
        userId: req.userId!,
        amount: String(plan.price),
        status: "paid",
        description: `${plan.name} plan subscription`,
      });
    }
    res.json({
      id: sub.id,
      planId: sub.planId,
      planName: sub.planName,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? periodEnd.toISOString(),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    });
  } catch (err) {
    req.log.error({ err }, "updateSubscription error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/payments/billing-history", requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db.select().from(billingHistoryTable)
      .where(eq(billingHistoryTable.userId, req.userId!))
      .orderBy(billingHistoryTable.createdAt);
    res.json(rows.map(r => ({ ...r, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "billingHistory error");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
