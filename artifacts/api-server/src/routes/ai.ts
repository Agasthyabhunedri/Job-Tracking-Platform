import { Router } from "express";
import { db, applicationsTable, companiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router = Router();

const RECOMMENDATION_TYPES = ["follow_up", "improve_resume", "high_priority", "status_change", "networking"] as const;
const PRIORITIES = ["high", "medium", "low"] as const;

router.get("/ai/recommendations", requireAuth, async (req: AuthRequest, res) => {
  try {
    const apps = await db
      .select({
        id: applicationsTable.id,
        jobTitle: applicationsTable.jobTitle,
        status: applicationsTable.status,
        appliedAt: applicationsTable.appliedAt,
        updatedAt: applicationsTable.updatedAt,
        companyName: companiesTable.name,
      })
      .from(applicationsTable)
      .leftJoin(companiesTable, eq(applicationsTable.companyId, companiesTable.id))
      .where(eq(applicationsTable.userId, req.userId!));

    const recommendations = [];
    const now = new Date();

    for (const app of apps) {
      const daysSinceApplied = app.appliedAt
        ? Math.floor((now.getTime() - app.appliedAt.getTime()) / 86400000)
        : 0;
      const daysSinceUpdate = Math.floor((now.getTime() - app.updatedAt.getTime()) / 86400000);

      if (app.status === "applied" && daysSinceApplied > 7) {
        recommendations.push({
          id: `follow-${app.id}`,
          type: "follow_up",
          priority: daysSinceApplied > 14 ? "high" : "medium",
          title: "Consider Following Up",
          description: `It's been ${daysSinceApplied} days since you applied for ${app.jobTitle}${app.companyName ? ` at ${app.companyName}` : ""}. A polite follow-up email could set you apart.`,
          applicationId: app.id,
          applicationTitle: app.jobTitle,
          companyName: app.companyName ?? null,
        });
      }

      if (app.status === "interview") {
        recommendations.push({
          id: `prep-${app.id}`,
          type: "high_priority",
          priority: "high",
          title: "Interview Preparation",
          description: `You have an active interview process for ${app.jobTitle}${app.companyName ? ` at ${app.companyName}` : ""}. Research the company culture, prepare your STAR stories, and practice common questions.`,
          applicationId: app.id,
          applicationTitle: app.jobTitle,
          companyName: app.companyName ?? null,
        });
      }

      if (app.status === "rejected" && daysSinceUpdate < 3) {
        recommendations.push({
          id: `resume-${app.id}`,
          type: "improve_resume",
          priority: "medium",
          title: "Tailor Your Resume",
          description: `Your application for ${app.jobTitle} was not selected. Consider tailoring your resume keywords and quantifying your achievements to better match similar roles.`,
          applicationId: app.id,
          applicationTitle: app.jobTitle,
          companyName: app.companyName ?? null,
        });
      }
    }

    if (apps.length === 0) {
      recommendations.push({
        id: "start",
        type: "high_priority",
        priority: "high",
        title: "Start Tracking Applications",
        description: "Add your first job application to unlock personalized AI recommendations and analytics.",
        applicationId: null,
        applicationTitle: null,
        companyName: null,
      });
    }

    if (recommendations.length < 3) {
      recommendations.push({
        id: "network",
        type: "networking",
        priority: "medium",
        title: "Expand Your Network",
        description: "Reach out to employees at companies you're interested in. Referrals significantly increase interview chances.",
        applicationId: null,
        applicationTitle: null,
        companyName: null,
      });
    }

    res.json(recommendations.slice(0, 10));
  } catch (err) {
    req.log.error({ err }, "aiRecommendations error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/ai/analyze/:applicationId", requireAuth, async (req: AuthRequest, res) => {
  const applicationId = parseInt(String(req.params.applicationId));
  if (isNaN(applicationId)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [app] = await db
      .select()
      .from(applicationsTable)
      .where(and(eq(applicationsTable.id, applicationId), eq(applicationsTable.userId, req.userId!)))
      .limit(1);
    if (!app) { res.status(404).json({ error: "Not found" }); return; }

    const score = Math.min(100, Math.max(20,
      (app.notes ? 20 : 0) +
      (app.salary ? 15 : 0) +
      (app.jobUrl ? 15 : 0) +
      (app.location ? 10 : 0) +
      (app.appliedAt ? 20 : 0) +
      (app.companyId ? 20 : 0)
    ));

    const suggestions = [];
    if (!app.notes) suggestions.push("Add notes about the role to improve tracking and interview prep");
    if (!app.salary) suggestions.push("Record the salary range to help evaluate offers later");
    if (!app.jobUrl) suggestions.push("Save the job posting URL before it expires");
    if (!app.companyId) suggestions.push("Link this application to a company for better analytics");
    if (!app.nextFollowUpAt) suggestions.push("Schedule a follow-up date to stay on top of your application");

    const nextSteps: string[] = [];
    if (app.status === "applied") nextSteps.push("Follow up after 7-10 business days if no response");
    if (app.status === "screening") nextSteps.push("Prepare for behavioral interview questions");
    if (app.status === "interview") nextSteps.push("Research the company's recent news and culture", "Prepare STAR format stories");

    const daysSinceApplied = app.appliedAt
      ? Math.floor((new Date().getTime() - app.appliedAt.getTime()) / 86400000)
      : 0;
    const estimatedResponse = daysSinceApplied < 14
      ? `Expected response within ${14 - daysSinceApplied} days`
      : "Response is overdue — consider following up";

    res.json({ applicationId, score, suggestions, nextSteps, estimatedResponse });
  } catch (err) {
    req.log.error({ err }, "analyzeApplication error");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
