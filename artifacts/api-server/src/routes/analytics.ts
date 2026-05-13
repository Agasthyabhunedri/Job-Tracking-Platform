import { Router } from "express";
import { db, applicationsTable, companiesTable } from "@workspace/db";
import { eq, sql, and, gte } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/analytics/summary", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const all = await db.select().from(applicationsTable).where(eq(applicationsTable.userId, userId));
    const total = all.length;
    const active = all.filter(a => !["rejected", "withdrawn", "offer"].includes(a.status)).length;
    const interviews = all.filter(a => ["interview", "offer"].includes(a.status)).length;
    const offers = all.filter(a => a.status === "offer").length;
    const rejected = all.filter(a => a.status === "rejected").length;

    const interviewRate = total > 0 ? Math.round((interviews / total) * 100) : 0;
    const offerRate = total > 0 ? Math.round((offers / total) * 100) : 0;
    const rejectionRate = total > 0 ? Math.round((rejected / total) * 100) : 0;

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thisWeek = all.filter(a => a.createdAt >= weekAgo).length;
    const thisMonth = all.filter(a => a.createdAt >= monthAgo).length;

    const responded = all.filter(a => a.status !== "applied" && a.appliedAt);
    const avgResponseDays = responded.length > 0
      ? Math.round(responded.reduce((sum, a) => {
          const diff = (a.updatedAt.getTime() - (a.appliedAt?.getTime() ?? a.createdAt.getTime())) / 86400000;
          return sum + diff;
        }, 0) / responded.length)
      : 0;

    res.json({ totalApplications: total, activeApplications: active, interviewRate, offerRate, rejectionRate, avgResponseDays, thisWeek, thisMonth });
  } catch (err) {
    req.log.error({ err }, "analyticsSummary error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/analytics/pipeline", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const all = await db.select({ status: applicationsTable.status }).from(applicationsTable).where(eq(applicationsTable.userId, userId));
    const stages = [
      { status: "applied", label: "Applied" },
      { status: "screening", label: "Screening" },
      { status: "interview", label: "Interview" },
      { status: "offer", label: "Offer" },
      { status: "rejected", label: "Rejected" },
      { status: "withdrawn", label: "Withdrawn" },
    ];
    const result = stages.map(s => ({
      ...s,
      count: all.filter(a => a.status === s.status).length,
    }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "analyticsPipeline error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/analytics/weekly", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const weeks: { week: string; count: number }[] = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const rows = await db.select({ id: applicationsTable.id })
        .from(applicationsTable)
        .where(and(
          eq(applicationsTable.userId, userId),
          gte(applicationsTable.createdAt, weekStart),
          sql`${applicationsTable.createdAt} < ${weekEnd}`
        ));
      const label = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      weeks.push({ week: label, count: rows.length });
    }
    res.json(weeks);
  } catch (err) {
    req.log.error({ err }, "analyticsWeekly error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/analytics/top-companies", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const rows = await db
      .select({
        companyName: companiesTable.name,
        count: sql<number>`cast(count(${applicationsTable.id}) as int)`,
      })
      .from(applicationsTable)
      .leftJoin(companiesTable, eq(applicationsTable.companyId, companiesTable.id))
      .where(eq(applicationsTable.userId, userId))
      .groupBy(companiesTable.name)
      .orderBy(sql`count(${applicationsTable.id}) desc`)
      .limit(10);
    res.json(rows.map(r => ({ companyName: r.companyName ?? "Unknown", count: r.count })));
  } catch (err) {
    req.log.error({ err }, "analyticsTopCompanies error");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
