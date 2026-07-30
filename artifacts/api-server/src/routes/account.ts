import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  customersTable,
  ordersTable,
  orderLinesTable,
} from "@workspace/db";
import {
  GetCurrentCustomerResponse,
  UpdateCustomerProfileBody,
  UpdateCustomerProfileResponse,
  ListPriceTiersResponse,
  GetDashboardSummaryResponse,
} from "@workspace/api-zod";
import {
  getCustomerWithTier,
  getAllTiers,
  tierToApi,
  nextTierProgress,
  round2,
} from "../lib/store";
import { requireCustomer } from "../middlewares/requireCustomer";

const router: IRouter = Router();

router.get("/me", requireCustomer, async (req, res): Promise<void> => {
  const { customer, tier } = await getCustomerWithTier(req.customer!.id);
  const tiers = await getAllTiers();
  const annualSpend = Number(customer.annualSpend);

  res.json(
    GetCurrentCustomerResponse.parse({
      id: customer.id,
      companyName: customer.companyName,
      contactName: customer.contactName,
      email: customer.email,
      defaultShippingAddress: customer.defaultShippingAddress,
      tier: tierToApi(tier),
      annualSpend,
      nextTier: nextTierProgress(tiers, tier, annualSpend),
    }),
  );
});

router.patch("/me", requireCustomer, async (req, res): Promise<void> => {
  const parsed = UpdateCustomerProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { companyName, contactName, defaultShippingAddress } = parsed.data;

  await db
    .update(customersTable)
    .set({
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      defaultShippingAddress:
        defaultShippingAddress && defaultShippingAddress.trim()
          ? defaultShippingAddress.trim()
          : null,
    })
    .where(eq(customersTable.id, req.customer!.id));

  const { customer, tier } = await getCustomerWithTier(req.customer!.id);
  const tiers = await getAllTiers();
  const annualSpend = Number(customer.annualSpend);

  res.json(
    UpdateCustomerProfileResponse.parse({
      id: customer.id,
      companyName: customer.companyName,
      contactName: customer.contactName,
      email: customer.email,
      defaultShippingAddress: customer.defaultShippingAddress,
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

router.get(
  "/dashboard/summary",
  requireCustomer,
  async (req, res): Promise<void> => {
    const customerId = req.customer!.id;
    const { customer, tier } = await getCustomerWithTier(customerId);
    const tiers = await getAllTiers();
    const annualSpend = Number(customer.annualSpend);

    const [stats] = await db
      .select({
        totalOrders: sql<number>`count(*)::int`,
        totalSavings: sql<number>`coalesce(sum(${ordersTable.savings}), 0)::float`,
      })
      .from(ordersTable)
      .where(eq(ordersTable.customerId, customerId));

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
      .where(eq(ordersTable.customerId, customerId))
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
  },
);

export default router;
