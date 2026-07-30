import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, ordersTable, orderLinesTable } from "@workspace/db";
import {
  GetCurrentCustomerResponse,
  ListPriceTiersResponse,
  GetDashboardSummaryResponse,
} from "@workspace/api-zod";
import {
  CURRENT_CUSTOMER_ID,
  getCurrentCustomerWithTier,
  getAllTiers,
  tierToApi,
  nextTierProgress,
  round2,
} from "../lib/store";

const router: IRouter = Router();

router.get("/me", async (_req, res): Promise<void> => {
  const { customer, tier } = await getCurrentCustomerWithTier();
  const tiers = await getAllTiers();
  const annualSpend = Number(customer.annualSpend);

  res.json(
    GetCurrentCustomerResponse.parse({
      id: customer.id,
      companyName: customer.companyName,
      contactName: customer.contactName,
      email: customer.email,
      tier: tierToApi(tier),
      annualSpend,
      nextTier: nextTierProgress(tiers, tier, annualSpend),
    }),
  );
});

router.get("/price-tiers", async (_req, res): Promise<void> => {
  const tiers = await getAllTiers();
  res.json(ListPriceTiersResponse.parse(tiers.map(tierToApi)));
});

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const { customer, tier } = await getCurrentCustomerWithTier();
  const tiers = await getAllTiers();
  const annualSpend = Number(customer.annualSpend);

  const [stats] = await db
    .select({
      totalOrders: sql<number>`count(*)::int`,
      totalSavings: sql<number>`coalesce(sum(${ordersTable.savings}), 0)::float`,
    })
    .from(ordersTable)
    .where(eq(ordersTable.customerId, CURRENT_CUSTOMER_ID));

  const recent = await db
    .select({
      id: ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      status: ordersTable.status,
      total: ordersTable.total,
      createdAt: ordersTable.createdAt,
      itemCount: sql<number>`(select coalesce(sum(${orderLinesTable.quantity}), 0) from ${orderLinesTable} where ${orderLinesTable.orderId} = ${ordersTable.id})::int`,
    })
    .from(ordersTable)
    .where(eq(ordersTable.customerId, CURRENT_CUSTOMER_ID))
    .orderBy(desc(ordersTable.createdAt))
    .limit(5);

  res.json(
    GetDashboardSummaryResponse.parse({
      totalOrders: stats?.totalOrders ?? 0,
      annualSpend,
      totalSavings: round2(stats?.totalSavings ?? 0),
      tier: tierToApi(tier),
      nextTier: nextTierProgress(tiers, tier, annualSpend),
      recentOrders: recent.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        itemCount: o.itemCount,
        total: Number(o.total),
        createdAt: o.createdAt.toISOString(),
      })),
    }),
  );
});

export default router;
