import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  cartItemsTable,
  productsTable,
  ordersTable,
  orderLinesTable,
  customersTable,
} from "@workspace/db";
import {
  ListOrdersResponse,
  CreateOrderBody,
  CreateOrderResponse,
  GetOrderParams,
  GetOrderResponse,
} from "@workspace/api-zod";
import {
  CURRENT_CUSTOMER_ID,
  getCurrentCustomerWithTier,
  tierPrice,
  round2,
} from "../lib/store";

const router: IRouter = Router();

function orderToApi(
  order: typeof ordersTable.$inferSelect,
  lines: (typeof orderLinesTable.$inferSelect)[],
) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    total: Number(order.total),
    savings: Number(order.savings),
    shippingAddress: order.shippingAddress,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    lines: lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      sku: l.sku,
      name: l.name,
      quantity: l.quantity,
      unitPrice: Number(l.unitPrice),
      lineTotal: Number(l.lineTotal),
    })),
  };
}

router.get("/orders", async (_req, res): Promise<void> => {
  const rows = await db
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
    .orderBy(desc(ordersTable.createdAt));

  res.json(
    ListOrdersResponse.parse(
      rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        itemCount: o.itemCount,
        total: Number(o.total),
        createdAt: o.createdAt.toISOString(),
      })),
    ),
  );
});

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { tier } = await getCurrentCustomerWithTier();
  const discount = Number(tier.discountPercent);

  const cartRows = await db
    .select({
      id: cartItemsTable.id,
      productId: cartItemsTable.productId,
      quantity: cartItemsTable.quantity,
      sku: productsTable.sku,
      name: productsTable.name,
      listPrice: productsTable.listPrice,
      stock: productsTable.stock,
    })
    .from(cartItemsTable)
    .innerJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
    .where(eq(cartItemsTable.customerId, CURRENT_CUSTOMER_ID));

  if (cartRows.length === 0) {
    res.status(400).json({ error: "Cart is empty" });
    return;
  }

  for (const row of cartRows) {
    if (row.quantity > row.stock) {
      res.status(400).json({
        error: `Only ${row.stock} in stock for ${row.name}`,
      });
      return;
    }
  }

  const lines = cartRows.map((r) => {
    const unitPrice = tierPrice(Number(r.listPrice), discount);
    return {
      productId: r.productId,
      sku: r.sku,
      name: r.name,
      quantity: r.quantity,
      unitPrice,
      lineTotal: round2(unitPrice * r.quantity),
      listLineTotal: round2(Number(r.listPrice) * r.quantity),
    };
  });

  const total = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const savings = round2(
    lines.reduce((s, l) => s + l.listLineTotal, 0) - total,
  );
  const orderNumber = `FT-${Date.now().toString(36).toUpperCase()}`;

  const order = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(ordersTable)
      .values({
        orderNumber,
        customerId: CURRENT_CUSTOMER_ID,
        status: "processing",
        total: total.toFixed(2),
        savings: savings.toFixed(2),
        shippingAddress: parsed.data.shippingAddress,
        notes: parsed.data.notes ?? null,
      })
      .returning();

    await tx.insert(orderLinesTable).values(
      lines.map((l) => ({
        orderId: created.id,
        productId: l.productId,
        sku: l.sku,
        name: l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice.toFixed(2),
        lineTotal: l.lineTotal.toFixed(2),
      })),
    );

    for (const l of lines) {
      await tx
        .update(productsTable)
        .set({ stock: sql`${productsTable.stock} - ${l.quantity}` })
        .where(eq(productsTable.id, l.productId));
    }

    await tx
      .update(customersTable)
      .set({
        annualSpend: sql`${customersTable.annualSpend} + ${total.toFixed(2)}`,
      })
      .where(eq(customersTable.id, CURRENT_CUSTOMER_ID));

    await tx
      .delete(cartItemsTable)
      .where(eq(cartItemsTable.customerId, CURRENT_CUSTOMER_ID));

    return created;
  });

  const orderLines = await db
    .select()
    .from(orderLinesTable)
    .where(eq(orderLinesTable.orderId, order.id));

  res.status(201).json(CreateOrderResponse.parse(orderToApi(order, orderLines)));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, params.data.id));
  if (!order || order.customerId !== CURRENT_CUSTOMER_ID) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const lines = await db
    .select()
    .from(orderLinesTable)
    .where(eq(orderLinesTable.orderId, order.id));

  res.json(GetOrderResponse.parse(orderToApi(order, lines)));
});

export default router;
