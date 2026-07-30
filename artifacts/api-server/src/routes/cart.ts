import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, cartItemsTable, productsTable } from "@workspace/db";
import {
  GetCartResponse,
  AddCartItemBody,
  AddCartItemResponse,
  UpdateCartItemParams,
  UpdateCartItemBody,
  UpdateCartItemResponse,
  RemoveCartItemParams,
  RemoveCartItemResponse,
} from "@workspace/api-zod";
import { getCustomerWithTier, tierPrice, round2 } from "../lib/store";
import { requireCustomer } from "../middlewares/requireCustomer";

const router: IRouter = Router();

router.use("/cart", requireCustomer);

export async function buildCart(customerId: number) {
  const { tier } = await getCustomerWithTier(customerId);
  const discount = Number(tier.discountPercent);

  const rows = await db
    .select({
      id: cartItemsTable.id,
      productId: cartItemsTable.productId,
      quantity: cartItemsTable.quantity,
      sku: productsTable.sku,
      name: productsTable.name,
      quality: productsTable.quality,
      imageUrl: productsTable.imageUrl,
      listPrice: productsTable.listPrice,
      stock: productsTable.stock,
    })
    .from(cartItemsTable)
    .innerJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
    .where(eq(cartItemsTable.customerId, customerId))
    .orderBy(asc(cartItemsTable.createdAt));

  const items = rows.map((r) => {
    const unitPrice = tierPrice(Number(r.listPrice), discount);
    return {
      id: r.id,
      productId: r.productId,
      sku: r.sku,
      name: r.name,
      quality: r.quality,
      imageUrl: r.imageUrl,
      quantity: r.quantity,
      unitPrice,
      lineTotal: round2(unitPrice * r.quantity),
      stock: r.stock,
    };
  });

  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const listSubtotal = round2(
    rows.reduce((s, r) => s + Number(r.listPrice) * r.quantity, 0),
  );

  return {
    items,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    subtotal,
    listSubtotal,
    savings: round2(listSubtotal - subtotal),
    discountPercent: discount,
  };
}

router.get("/cart", async (req, res): Promise<void> => {
  res.json(GetCartResponse.parse(await buildCart(req.customer!.id)));
});

router.delete("/cart", async (req, res): Promise<void> => {
  await db
    .delete(cartItemsTable)
    .where(eq(cartItemsTable.customerId, req.customer!.id));
  res.sendStatus(204);
});

router.post("/cart/items", async (req, res): Promise<void> => {
  const customerId = req.customer!.id;
  const parsed = AddCartItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { productId, quantity } = parsed.data;

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId));
  if (!product) {
    res.status(400).json({ error: "Product not found" });
    return;
  }

  const [existing] = await db
    .select()
    .from(cartItemsTable)
    .where(
      and(
        eq(cartItemsTable.customerId, customerId),
        eq(cartItemsTable.productId, productId),
      ),
    );

  const newQty = (existing?.quantity ?? 0) + quantity;
  if (newQty > product.stock) {
    res.status(400).json({
      error: `Only ${product.stock} in stock for ${product.name}`,
    });
    return;
  }

  if (existing) {
    await db
      .update(cartItemsTable)
      .set({ quantity: newQty })
      .where(eq(cartItemsTable.id, existing.id));
  } else {
    await db.insert(cartItemsTable).values({
      customerId,
      productId,
      quantity,
    });
  }

  res.json(AddCartItemResponse.parse(await buildCart(customerId)));
});

router.patch("/cart/items/:id", async (req, res): Promise<void> => {
  const customerId = req.customer!.id;
  const params = UpdateCartItemParams.safeParse(req.params);
  const body = UpdateCartItemBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const [item] = await db
    .select()
    .from(cartItemsTable)
    .where(
      and(
        eq(cartItemsTable.id, params.data.id),
        eq(cartItemsTable.customerId, customerId),
      ),
    );
  if (!item) {
    res.status(404).json({ error: "Cart item not found" });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, item.productId));
  if (product && body.data.quantity > product.stock) {
    res.status(400).json({ error: `Only ${product.stock} in stock` });
    return;
  }

  await db
    .update(cartItemsTable)
    .set({ quantity: body.data.quantity })
    .where(eq(cartItemsTable.id, item.id));

  res.json(UpdateCartItemResponse.parse(await buildCart(customerId)));
});

router.delete("/cart/items/:id", async (req, res): Promise<void> => {
  const customerId = req.customer!.id;
  const params = RemoveCartItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(cartItemsTable)
    .where(
      and(
        eq(cartItemsTable.id, params.data.id),
        eq(cartItemsTable.customerId, customerId),
      ),
    );

  res.json(RemoveCartItemResponse.parse(await buildCart(customerId)));
});

export default router;
