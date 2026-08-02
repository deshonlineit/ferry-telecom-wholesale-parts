import { Router, type IRouter } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
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
  getCustomerWithTier,
  applyTierUpgrade,
  getExplicitTierPrices,
  resolvePrice,
  round2,
} from "../lib/store";
import { requireCustomer } from "../middlewares/requireCustomer";

class OutOfStockError extends Error {}

const router: IRouter = Router();

router.use("/orders", requireCustomer);

async function fetchOrderLines(orderId: number) {
  const rows = await db
    .select({
      line: orderLinesTable,
      imageUrl: productsTable.imageUrl,
    })
    .from(orderLinesTable)
    .leftJoin(productsTable, eq(orderLinesTable.productId, productsTable.id))
    .where(eq(orderLinesTable.orderId, orderId));
  return rows.map((r) => ({ ...r.line, imageUrl: r.imageUrl ?? null }));
}
function orderToApi(
  order: typeof ordersTable.$inferSelect,
  lines: (typeof orderLinesTable.$inferSelect & { imageUrl: string | null })[],
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
      imageUrl: l.imageUrl,
      quantity: l.quantity,
      unitPrice: Number(l.unitPrice),
      lineTotal: Number(l.lineTotal),
    })),
  };
}

router.get("/orders", async (req, res): Promise<void> => {
  const customerId = req.customer!.id;
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
    .where(eq(ordersTable.customerId, customerId))
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

  const body = parsed.data;
  const customerId = req.customer!.id;
  const { tier } = await getCustomerWithTier(customerId);
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
    .where(eq(cartItemsTable.customerId, customerId));

  if (cartRows.length === 0) {
    res.status(400).json({ error: "Cart is empty" });
    return;
  }

  for (const row of cartRows) {
    if (row.quantity > row.stock) {
      res.status(400).json({
        error:
          row.stock === 0
            ? `"${row.name}" just sold out while you were checking out. Please review your cart.`
            : `Only ${row.stock} in stock for ${row.name}. Please review your cart.`,
        code: "OUT_OF_STOCK",
      });
      return;
    }
  }

  const explicitOrder = await getExplicitTierPrices(
    tier.id,
    cartRows.map((r) => r.productId),
  );

  const lines = cartRows.map((r) => {
    const listPrice = Number(r.listPrice);
    const unitPrice = resolvePrice(explicitOrder, r.productId, listPrice, discount);
    return {
      productId: r.productId,
      sku: r.sku,
      name: r.name,
      quantity: r.quantity,
      unitPrice,
      lineTotal: round2(unitPrice * r.quantity),
      listLineTotal: round2(listPrice * r.quantity),
    };
  });

  const total = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const savings = round2(
    lines.reduce((s, l) => s + l.listLineTotal, 0) - total,
  );
  const orderNumber = `FT-${Date.now().toString(36).toUpperCase()}`;

  let order;
  try {
    order = await runCheckoutTransaction();
  } catch (e) {
    if (e instanceof OutOfStockError) {
      res.status(400).json({
        error: `"${e.message}" just sold out while you were checking out. Please review your cart.`,
        code: "OUT_OF_STOCK",
      });
      return;
    }
    throw e;
  }

  async function runCheckoutTransaction() {
    return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(ordersTable)
      .values({
        orderNumber,
        customerId: customerId,
        status: "processing",
        total: total.toFixed(2),
        savings: savings.toFixed(2),
        shippingAddress: body.shippingAddress,
        notes: body.notes ?? null,
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
      // Conditional decrement: fails the transaction if stock ran out
      // between validation and commit (concurrent checkout).
      const updated = await tx
        .update(productsTable)
        .set({ stock: sql`${productsTable.stock} - ${l.quantity}` })
        .where(
          and(
            eq(productsTable.id, l.productId),
            gte(productsTable.stock, l.quantity),
          ),
        )
        .returning({ id: productsTable.id });
      if (updated.length === 0) {
        throw new OutOfStockError(l.name);
      }
    }

    await tx
      .update(customersTable)
      .set({
        annualSpend: sql`${customersTable.annualSpend} + ${total.toFixed(2)}`,
      })
      .where(eq(customersTable.id, customerId));

    await tx
      .delete(cartItemsTable)
      .where(eq(cartItemsTable.customerId, customerId));

    return created;
    });
  }

  await applyTierUpgrade(customerId);

  const orderLines = await fetchOrderLines(order.id);

  res.status(201).json(CreateOrderResponse.parse(orderToApi(order, orderLines)));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const customerId = req.customer!.id;
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, params.data.id));
  if (!order || order.customerId !== customerId) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const lines = await fetchOrderLines(order.id);

  res.json(GetOrderResponse.parse(orderToApi(order, lines)));
});

export default router;
