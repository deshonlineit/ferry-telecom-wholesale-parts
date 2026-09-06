import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import {
  db,
  customerAddressesTable,
  customersTable,
  ordersTable,
  orderLinesTable,
} from "@workspace/db";
import {
  GetAccountAccessResponse,
  GetCurrentCustomerResponse,
  UpdateCustomerProfileBody,
  UpdateCustomerProfileResponse,
  ListPriceTiersResponse,
  GetDashboardSummaryResponse,
  ListCustomerAddressesResponse,
  CreateCustomerAddressBody,
  CreateCustomerAddressResponse,
  UpdateCustomerAddressParams,
  UpdateCustomerAddressBody,
  UpdateCustomerAddressResponse,
  DeleteCustomerAddressParams,
} from "@workspace/api-zod";
import {
  getCustomerWithTier,
  getAllTiers,
  tierToApi,
  nextTierProgress,
  round2,
} from "../lib/store";
import { requireCustomer } from "../middlewares/requireCustomer";
import { isStaffAccount } from "../lib/staffAccess";

const router: IRouter = Router();

router.get("/me/access", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store");
  const userId = getAuth(req)?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    res.json(GetAccountAccessResponse.parse({
      isStaff: await isStaffAccount(userId),
    }));
  } catch (error) {
    req.log?.error?.({ err: error }, "Account access check failed");
    res.status(503).json({ error: "Unable to verify account access" });
  }
});

function addressResponse(address: typeof customerAddressesTable.$inferSelect) {
  return {
    id: address.id,
    label: address.label,
    shippingAddress: address.shippingAddress,
    isDefault: address.isDefault,
  };
}

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
  const { companyName, contactName } = parsed.data;
  if (!companyName.trim() || !contactName.trim()) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const hasLegacyAddress = Object.prototype.hasOwnProperty.call(
    parsed.data,
    "defaultShippingAddress",
  );

  await db.transaction(async (tx) => {
    const customerId = req.customer!.id;
    await tx.execute(
      sql`select id from ${customersTable} where id = ${customerId} for update`,
    );

    await tx
      .update(customersTable)
      .set({
        companyName: companyName.trim(),
        contactName: contactName.trim(),
      })
      .where(eq(customersTable.id, customerId));

    if (!hasLegacyAddress) return;

    const legacyAddress = parsed.data.defaultShippingAddress?.trim() || null;
    if (legacyAddress === null) {
      await tx
        .update(customerAddressesTable)
        .set({ isDefault: false })
        .where(eq(customerAddressesTable.customerId, customerId));
    } else {
      const [currentDefault] = await tx
        .select()
        .from(customerAddressesTable)
        .where(
          and(
            eq(customerAddressesTable.customerId, customerId),
            eq(customerAddressesTable.isDefault, true),
          ),
        )
        .limit(1);
      if (currentDefault) {
        await tx
          .update(customerAddressesTable)
          .set({ shippingAddress: legacyAddress })
          .where(eq(customerAddressesTable.id, currentDefault.id));
      } else {
        await tx
          .update(customerAddressesTable)
          .set({ isDefault: false })
          .where(eq(customerAddressesTable.customerId, customerId));
        await tx.insert(customerAddressesTable).values({
          customerId,
          label: "Default address",
          shippingAddress: legacyAddress,
          isDefault: true,
        });
      }
    }

    await tx
      .update(customersTable)
      .set({ defaultShippingAddress: legacyAddress })
      .where(eq(customersTable.id, customerId));
  });

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

router.get(
  "/me/addresses",
  requireCustomer,
  async (req, res): Promise<void> => {
    const addresses = await db
      .select()
      .from(customerAddressesTable)
      .where(eq(customerAddressesTable.customerId, req.customer!.id))
      .orderBy(asc(customerAddressesTable.createdAt), asc(customerAddressesTable.id));
    res.json(ListCustomerAddressesResponse.parse(addresses.map(addressResponse)));
  },
);

router.post(
  "/me/addresses",
  requireCustomer,
  async (req, res): Promise<void> => {
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? {
            ...req.body,
            label:
              typeof req.body.label === "string"
                ? req.body.label.trim()
                : req.body.label,
            shippingAddress:
              typeof req.body.shippingAddress === "string"
                ? req.body.shippingAddress.trim()
                : req.body.shippingAddress,
          }
        : req.body;
    const parsed = CreateCustomerAddressBody.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const { label, shippingAddress } = parsed.data;

    const created = await db.transaction(async (tx) => {
      const customerId = req.customer!.id;
      await tx.execute(
        sql`select id from ${customersTable} where id = ${customerId} for update`,
      );
      const [first] = await tx
        .select({ id: customerAddressesTable.id })
        .from(customerAddressesTable)
        .where(eq(customerAddressesTable.customerId, customerId))
        .limit(1);
      const isDefault = !first || parsed.data.isDefault === true;
      if (isDefault) {
        await tx
          .update(customerAddressesTable)
          .set({ isDefault: false })
          .where(eq(customerAddressesTable.customerId, customerId));
      }
      const [address] = await tx
        .insert(customerAddressesTable)
        .values({ customerId, label, shippingAddress, isDefault })
        .returning();
      if (isDefault) {
        await tx
          .update(customersTable)
          .set({ defaultShippingAddress: shippingAddress })
          .where(eq(customersTable.id, customerId));
      }
      return address;
    });

    res.status(201).json(CreateCustomerAddressResponse.parse(addressResponse(created)));
  },
);

router.patch(
  "/me/addresses/:id",
  requireCustomer,
  async (req, res): Promise<void> => {
    const params = UpdateCustomerAddressParams.safeParse(req.params);
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? {
            ...req.body,
            ...(typeof req.body.label === "string"
              ? { label: req.body.label.trim() }
              : {}),
            ...(typeof req.body.shippingAddress === "string"
              ? { shippingAddress: req.body.shippingAddress.trim() }
              : {}),
          }
        : req.body;
    const parsed = UpdateCustomerAddressBody.safeParse(body);
    if (!params.success || !parsed.success || Object.keys(parsed.data).length === 0) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const { label, shippingAddress } = parsed.data;

    const updated = await db.transaction(async (tx) => {
      const customerId = req.customer!.id;
      await tx.execute(
        sql`select id from ${customersTable} where id = ${customerId} for update`,
      );
      const [existing] = await tx
        .select()
        .from(customerAddressesTable)
        .where(
          and(
            eq(customerAddressesTable.id, params.data.id),
            eq(customerAddressesTable.customerId, customerId),
          ),
        )
        .limit(1);
      if (!existing) return null;

      if (parsed.data.isDefault === true) {
        await tx
          .update(customerAddressesTable)
          .set({ isDefault: false })
          .where(eq(customerAddressesTable.customerId, customerId));
      } else if (parsed.data.isDefault === false && existing.isDefault) {
        const [replacement] = await tx
          .select()
          .from(customerAddressesTable)
          .where(
            and(
              eq(customerAddressesTable.customerId, customerId),
              ne(customerAddressesTable.id, existing.id),
            ),
          )
          .orderBy(asc(customerAddressesTable.createdAt), asc(customerAddressesTable.id))
          .limit(1);
        if (replacement) {
          await tx
            .update(customerAddressesTable)
            .set({ isDefault: false })
            .where(eq(customerAddressesTable.id, existing.id));
          await tx
            .update(customerAddressesTable)
            .set({ isDefault: true })
            .where(eq(customerAddressesTable.id, replacement.id));
        }
      }

      await tx
        .update(customerAddressesTable)
        .set({
          ...(label !== undefined ? { label } : {}),
          ...(shippingAddress !== undefined ? { shippingAddress } : {}),
          ...(parsed.data.isDefault === true ? { isDefault: true } : {}),
        })
        .where(eq(customerAddressesTable.id, existing.id));

      const [address] = await tx
        .select()
        .from(customerAddressesTable)
        .where(eq(customerAddressesTable.id, existing.id));
      const [currentDefault] = await tx
        .select()
        .from(customerAddressesTable)
        .where(
          and(
            eq(customerAddressesTable.customerId, customerId),
            eq(customerAddressesTable.isDefault, true),
          ),
        )
        .limit(1);
      await tx
        .update(customersTable)
        .set({
          defaultShippingAddress: currentDefault?.shippingAddress ?? null,
        })
        .where(eq(customersTable.id, customerId));
      return address;
    });

    if (!updated) {
      res.status(404).json({ error: "Address not found" });
      return;
    }
    res.json(UpdateCustomerAddressResponse.parse(addressResponse(updated)));
  },
);

router.delete(
  "/me/addresses/:id",
  requireCustomer,
  async (req, res): Promise<void> => {
    const params = DeleteCustomerAddressParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const deleted = await db.transaction(async (tx) => {
      const customerId = req.customer!.id;
      await tx.execute(
        sql`select id from ${customersTable} where id = ${customerId} for update`,
      );
      const [address] = await tx
        .select()
        .from(customerAddressesTable)
        .where(
          and(
            eq(customerAddressesTable.id, params.data.id),
            eq(customerAddressesTable.customerId, customerId),
          ),
        )
        .limit(1);
      if (!address) return false;
      await tx
        .delete(customerAddressesTable)
        .where(eq(customerAddressesTable.id, address.id));

      if (address.isDefault) {
        const [replacement] = await tx
          .select()
          .from(customerAddressesTable)
          .where(eq(customerAddressesTable.customerId, customerId))
          .orderBy(asc(customerAddressesTable.createdAt), asc(customerAddressesTable.id))
          .limit(1);
        if (replacement) {
          await tx
            .update(customerAddressesTable)
            .set({ isDefault: true })
            .where(eq(customerAddressesTable.id, replacement.id));
        }
        await tx
          .update(customersTable)
          .set({
            defaultShippingAddress: replacement?.shippingAddress ?? null,
          })
          .where(eq(customersTable.id, customerId));
      }
      return true;
    });

    if (!deleted) {
      res.status(404).json({ error: "Address not found" });
      return;
    }
    res.status(204).send();
  },
);

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
