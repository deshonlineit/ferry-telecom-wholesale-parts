import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { isStaffAccount } from "../lib/staffAccess";

/**
 * Staff-only guard for catalog management endpoints.
 *
 * A user counts as staff when their Clerk account has
 * `publicMetadata.role === "admin"` (or `"staff"`), or their user id is
 * listed in the STAFF_USER_IDS env var (comma-separated).
 * Regular signed-in customers get 403; anonymous callers get 401.
 */
export async function requireStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (await isStaffAccount(userId)) {
      next();
      return;
    }

    res.status(403).json({ error: "Staff access required" });
  } catch (error) {
    req.log?.error?.({ err: error }, "requireStaff check failed");
    res.status(403).json({ error: "Staff access required" });
  }
}
