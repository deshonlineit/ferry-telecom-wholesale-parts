import { eq, asc } from "drizzle-orm";
import {
  db,
  customersTable,
  priceTiersTable,
  type Customer,
  type PriceTier,
} from "@workspace/db";

// Demo storefront operates as the first (and only) seeded customer account.
export const CURRENT_CUSTOMER_ID = 1;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function tierPrice(listPrice: number, discountPercent: number): number {
  return round2(listPrice * (1 - discountPercent / 100));
}

export async function getCurrentCustomerWithTier(): Promise<{
  customer: Customer;
  tier: PriceTier;
}> {
  const [row] = await db
    .select()
    .from(customersTable)
    .innerJoin(priceTiersTable, eq(customersTable.tierId, priceTiersTable.id))
    .where(eq(customersTable.id, CURRENT_CUSTOMER_ID));

  if (!row) {
    throw new Error("Demo customer is not seeded");
  }

  return { customer: row.customers, tier: row.price_tiers };
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
