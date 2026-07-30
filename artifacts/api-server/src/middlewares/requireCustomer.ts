import type { NextFunction, Request, Response } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { asc, eq } from "drizzle-orm";
import {
  db,
  customersTable,
  priceTiersTable,
  type Customer,
} from "@workspace/db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customer?: Customer;
    }
  }
}

/**
 * Requires a signed-in Clerk user and resolves (or JIT-provisions) the
 * matching customer record. New customers start on the lowest-rank
 * (Bronze) price tier.
 */
export async function requireCustomer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [existing] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.clerkUserId, userId));

    if (existing) {
      req.customer = existing;
      next();
      return;
    }

    // JIT-provision a customer for this Clerk user.
    const user = await clerkClient.users.getUser(userId);
    const email =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      `${userId}@unknown.local`;
    const contactName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || email;

    // Link by email if a pre-existing (unlinked) customer record matches.
    const [byEmail] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.email, email));

    if (byEmail && !byEmail.clerkUserId) {
      const [linked] = await db
        .update(customersTable)
        .set({ clerkUserId: userId })
        .where(eq(customersTable.id, byEmail.id))
        .returning();
      req.customer = linked;
      next();
      return;
    }

    const [bronze] = await db
      .select()
      .from(priceTiersTable)
      .orderBy(asc(priceTiersTable.rank))
      .limit(1);
    if (!bronze) {
      res.status(500).json({ error: "Price tiers are not seeded" });
      return;
    }

    const [created] = await db
      .insert(customersTable)
      .values({
        clerkUserId: userId,
        companyName: contactName,
        contactName,
        email,
        tierId: bronze.id,
      })
      .onConflictDoNothing({ target: customersTable.clerkUserId })
      .returning();

    if (created) {
      req.customer = created;
    } else {
      // Concurrent request already provisioned the customer.
      const [row] = await db
        .select()
        .from(customersTable)
        .where(eq(customersTable.clerkUserId, userId));
      req.customer = row;
    }
    next();
  } catch (err) {
    next(err);
  }
}
