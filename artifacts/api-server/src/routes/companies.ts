import { Router } from "express";
import { db, companiesTable, applicationsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { CreateCompanyBody, UpdateCompanyBody } from "@workspace/api-zod";

const router = Router();

router.get("/companies", requireAuth, async (req: AuthRequest, res) => {
  try {
    const companies = await db
      .select({
        id: companiesTable.id,
        name: companiesTable.name,
        website: companiesTable.website,
        industry: companiesTable.industry,
        location: companiesTable.location,
        notes: companiesTable.notes,
        createdAt: companiesTable.createdAt,
        applicationCount: sql<number>`cast(count(${applicationsTable.id}) as int)`,
      })
      .from(companiesTable)
      .leftJoin(applicationsTable, eq(applicationsTable.companyId, companiesTable.id))
      .where(eq(companiesTable.userId, req.userId!))
      .groupBy(companiesTable.id)
      .orderBy(companiesTable.name);
    res.json(companies);
  } catch (err) {
    req.log.error({ err }, "listCompanies error");
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/companies", requireAuth, async (req: AuthRequest, res) => {
  const parse = CreateCompanyBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid input" }); return; }
  try {
    const [company] = await db.insert(companiesTable).values({
      userId: req.userId!,
      ...parse.data,
    }).returning();
    res.status(201).json({ ...company, applicationCount: 0 });
  } catch (err) {
    req.log.error({ err }, "createCompany error");
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/companies/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [company] = await db
      .select({
        id: companiesTable.id,
        name: companiesTable.name,
        website: companiesTable.website,
        industry: companiesTable.industry,
        location: companiesTable.location,
        notes: companiesTable.notes,
        createdAt: companiesTable.createdAt,
        applicationCount: sql<number>`cast(count(${applicationsTable.id}) as int)`,
      })
      .from(companiesTable)
      .leftJoin(applicationsTable, eq(applicationsTable.companyId, companiesTable.id))
      .where(and(eq(companiesTable.id, id), eq(companiesTable.userId, req.userId!)))
      .groupBy(companiesTable.id)
      .limit(1);
    if (!company) { res.status(404).json({ error: "Not found" }); return; }
    res.json(company);
  } catch (err) {
    req.log.error({ err }, "getCompany error");
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/companies/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parse = UpdateCompanyBody.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid input" }); return; }
  try {
    const [company] = await db.update(companiesTable)
      .set(parse.data)
      .where(and(eq(companiesTable.id, id), eq(companiesTable.userId, req.userId!)))
      .returning();
    if (!company) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...company, applicationCount: 0 });
  } catch (err) {
    req.log.error({ err }, "updateCompany error");
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/companies/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(companiesTable).where(and(eq(companiesTable.id, id), eq(companiesTable.userId, req.userId!)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "deleteCompany error");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
