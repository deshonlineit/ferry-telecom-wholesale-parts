import { eq, asc, lte, desc, and } from "drizzle-orm";
import {
  db,
  customersTable,
  priceTiersTable,
  type Customer,
  type PriceTier,
} from "@workspace/db";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function tierPrice(listPrice: number, discountPercent: number): number {
  return round2(listPrice * (1 - discountPercent / 100));
}

export async function getCustomerWithTier(customerId: number): Promise<{
  customer: Customer;
  tier: PriceTier;
}> {
  const [row] = await db
    .select()
    .from(customersTable)
    .innerJoin(priceTiersTable, eq(customersTable.tierId, priceTiersTable.id))
    .where(eq(customersTable.id, customerId));

  if (!row) {
    throw new Error(`Customer ${customerId} not found`);
  }

  return { customer: row.customers, tier: row.price_tiers };
}

/**
 * Upgrade the customer's tier to the highest tier whose minimum annual
 * spend they now qualify for (never downgrades).
 */
export async function applyTierUpgrade(customerId: number): Promise<void> {
  const { customer, tier } = await getCustomerWithTier(customerId);
  const spend = Number(customer.annualSpend);

  const [best] = await db
    .select()
    .from(priceTiersTable)
    .where(lte(priceTiersTable.minAnnualSpend, spend.toFixed(2)))
    .orderBy(desc(priceTiersTable.rank))
    .limit(1);

  if (best && best.rank > tier.rank) {
    await db
      .update(customersTable)
      .set({ tierId: best.id })
      .where(
        and(
          eq(customersTable.id, customerId),
          eq(customersTable.tierId, tier.id),
        ),
      );
  }
}

export function tierToApi(tier: PriceTier) {
  return {
    id: tier.id,
    name: tier.name,
    discountPercent: Number(tier.discountPercent),
    minAnnualSpend: Number(tier.minAnnualSpend),
    description: tier.description,
  };
}

export async function getAllTiers(): Promise<PriceTier[]> {
  return db.select().from(priceTiersTable).orderBy(asc(priceTiersTable.rank));
}

export function nextTierProgress(
  tiers: PriceTier[],
  currentTier: PriceTier,
  annualSpend: number,
) {
  const next = tiers.find((t) => t.rank === currentTier.rank + 1);
  if (!next) return null;
  const min = Number(next.minAnnualSpend);
  const remaining = Math.max(0, round2(min - annualSpend));
  const progress = min > 0 ? Math.min(100, round2((annualSpend / min) * 100)) : 100;
  return {
    tier: tierToApi(next),
    remainingSpend: remaining,
    progressPercent: progress,
  };
}
