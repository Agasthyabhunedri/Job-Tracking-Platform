import { Router } from "express";
import { db, applicationsTable, companiesTable, notificationsTable } from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import {
  CreateApplicationBody,
  UpdateApplicationBody,
  UpdateApplicationStatusBody,
  ListApplicationsQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/applications", requireAuth, async (req: AuthRequest, res) => {
  const parse = ListApplicationsQueryParams.safeParse(req.query);
  const params = parse.success ? parse.data : {};
  try {
    let query = db
      .select({
        id: applicationsTable.id,
        jobTitle: applicationsTable.jobTitle,
        status: applicationsTable.status,
        companyId: applicationsTable.companyId,
        companyName: companiesTable.name,
        jobUrl: applicationsTable.jobUrl,
        salary: applicationsTable.salary,
        location: applicationsTable.location,
        notes: applicationsTable.notes,
        appliedAt: applicationsTable.appliedAt,
        nextFollowUpAt: applicationsTable.nextFollowUpAt,
        interviewStage: applicationsTable.interviewStage,
        createdAt: applicationsTable.createdAt,
        updatedAt: applicationsTable.updatedAt,
      })
      .from(applicationsTable)
      .leftJoin(companiesTable, eq(applicationsTable.companyId, companiesTable.id))
      .where(eq(applicationsTable.userId, req.userId!))
      .$dynamic();

    const results = await query.orderBy(sql`${applicationsTable.updatedAt} desc`);

    let filtered = results;
    if (params.status) filtered = filtered.filter(a => a.status === params.status);
    if (params.companyId) filtered = filtered.filter(a => a.companyId === Number(params.companyId));
    if (params.search) {
      const s = params.search.toLowerCase();
      filtered = filtered.filter(a =>
        a.jobTitle.toLowerCase().includes(s) || (a.companyName ?? "").toLowerCase().includes(s)
      );
    }

    res.json(filtered);
  } catch (err) {
    req.log.error({ err }, "listApplications error");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/applications", requireAuth, async (req: AuthRequest, res) => {
  const parse = CreateApplicationBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid input" }); return; }
  try {
    const [app] = await db.insert(applicationsTable).values({
      userId: req.userId!,
      ...parse.data,
      appliedAt: parse.data.appliedAt ? new Date(parse.data.appliedAt) : new Date(),
      nextFollowUpAt: parse.data.nextFollowUpAt ? new Date(parse.data.nextFollowUpAt) : undefined,
    }).returning();
    const company = app.companyId
      ? (await db.select().from(companiesTable).where(eq(companiesTable.id, app.companyId)).limit(1))[0]
      : null;
    await db.insert(notificationsTable).values({
      userId: req.userId!,
      type: "application_created",
      title: "Application Added",
      message: `Your application for ${app.jobTitle}${company ? ` at ${company.name}` : ""} has been added.`,
      read: false,
      applicationId: app.id,
    });
    res.status(201).json({ ...app, companyName: company?.name ?? null });
  } catch (err) {
    req.log.error({ err }, "createApplication error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/applications/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [app] = await db
      .select({
        id: applicationsTable.id,
        jobTitle: applicationsTable.jobTitle,
        status: applicationsTable.status,
        companyId: applicationsTable.companyId,
        companyName: companiesTable.name,
        jobUrl: applicationsTable.jobUrl,
        salary: applicationsTable.salary,
        location: applicationsTable.location,
        notes: applicationsTable.notes,
        appliedAt: applicationsTable.appliedAt,
        nextFollowUpAt: applicationsTable.nextFollowUpAt,
        interviewStage: applicationsTable.interviewStage,
        createdAt: applicationsTable.createdAt,
        updatedAt: applicationsTable.updatedAt,
      })
      .from(applicationsTable)
      .leftJoin(companiesTable, eq(applicationsTable.companyId, companiesTable.id))
      .where(and(eq(applicationsTable.id, id), eq(applicationsTable.userId, req.userId!)))
      .limit(1);
    if (!app) { res.status(404).json({ error: "Not found" }); return; }
    res.json(app);
  } catch (err) {
    req.log.error({ err }, "getApplication error");
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/applications/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parse = UpdateApplicationBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid input" }); return; }
  try {
    const updateData: Record<string, unknown> = { ...parse.data, updatedAt: new Date() };
    if (parse.data.appliedAt) updateData.appliedAt = new Date(parse.data.appliedAt);
    if (parse.data.nextFollowUpAt) updateData.nextFollowUpAt = new Date(parse.data.nextFollowUpAt);
    const [app] = await db.update(applicationsTable)
      .set(updateData)
      .where(and(eq(applicationsTable.id, id), eq(applicationsTable.userId, req.userId!)))
      .returning();
    if (!app) { res.status(404).json({ error: "Not found" }); return; }
    const company = app.companyId
      ? (await db.select().from(companiesTable).where(eq(companiesTable.id, app.companyId)).limit(1))[0]
      : null;
    res.json({ ...app, companyName: company?.name ?? null });
  } catch (err) {
    req.log.error({ err }, "updateApplication error");
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/applications/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(applicationsTable).where(and(eq(applicationsTable.id, id), eq(applicationsTable.userId, req.userId!)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "deleteApplication error");
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/applications/:id/status", requireAuth, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parse = UpdateApplicationStatusBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid input" }); return; }
  try {
    const [app] = await db.update(applicationsTable)
      .set({ status: parse.data.status, interviewStage: parse.data.interviewStage, updatedAt: new Date() })
      .where(and(eq(applicationsTable.id, id), eq(applicationsTable.userId, req.userId!)))
      .returning();
    if (!app) { res.status(404).json({ error: "Not found" }); return; }
    const company = app.companyId
      ? (await db.select().from(companiesTable).where(eq(companiesTable.id, app.companyId)).limit(1))[0]
      : null;
    await db.insert(notificationsTable).values({
      userId: req.userId!,
      type: "status_updated",
      title: "Application Status Updated",
      message: `${app.jobTitle} status changed to ${parse.data.status}.`,
      read: false,
      applicationId: app.id,
    });
    res.json({ ...app, companyName: company?.name ?? null });
  } catch (err) {
    req.log.error({ err }, "updateApplicationStatus error");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
