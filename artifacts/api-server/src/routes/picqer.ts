import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireStaff } from "../middlewares/requireStaff";
import { picqerEnabled } from "../lib/picqerGate";

const router: IRouter = Router();
router.get("/admin/integrations/picqer", requireStaff, async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`SELECT status,count(*)::int AS count,min(next_attempt_at) AS next_attempt_at
    FROM picqer_outbox GROUP BY status ORDER BY status`);
  res.json({ name: "picqer", enabled: picqerEnabled(), jobs: rows.rows });
});
export default router;