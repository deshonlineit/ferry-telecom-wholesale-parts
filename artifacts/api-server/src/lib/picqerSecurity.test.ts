import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { picqerEnabled } from "./picqerGate";
import { verifyPicqerSignature } from "./picqerSecurity";
import { picqerExactReferenceCandidate, picqerFreeStock, picqerOrderId, picqerOrderPayload, picqerWebhookKey } from "./picqerPayload";

describe("Picqer safety boundaries", () => {
  it("hard-blocks network integration outside explicit production opt-in", () => {
    expect(picqerEnabled({ PICQER_ENABLED: "1", LIVE_INTEGRATIONS: "1", NODE_ENV: "test" })).toBe(false);
    expect(picqerEnabled({ PICQER_ENABLED: "1", LIVE_INTEGRATIONS: "1", NODE_ENV: "production" })).toBe(true);
  });
  it("accepts only the official base64 HMAC over exact bytes", () => {
    const body = Buffer.from('{"idhook":1}');
    const signature = crypto.createHmac("sha256", "webhook-secret").update(body).digest("base64");
    expect(verifyPicqerSignature(body, signature, "webhook-secret")).toBe(true);
    expect(verifyPicqerSignature(Buffer.from('{"idhook":2}'), signature, "webhook-secret")).toBe(false);
    expect(verifyPicqerSignature(body, "not-base64", "webhook-secret")).toBe(false);
  });
  it("keys deliveries rather than their registered hook and selects only exact search matches", () => {
    const body = Buffer.from('{"a":1}');
    expect(picqerWebhookKey("products.free_stock_changed", "7", "2026-01-01", body))
      .not.toBe(picqerWebhookKey("products.free_stock_changed", "7", "2026-01-02", body));
    expect(picqerExactReferenceCandidate([{ reference: "wrong", idorder: 2 }, { reference: "FERRY-1", idorder: 3 }], "FERRY-1")?.idorder).toBe(3);
    expect(picqerOrderId({ idorder: 3 })).toBe(3);
    expect(picqerOrderId({ id: 3 })).toBeNull();
  });
  it("maps only a validated address snapshot to Picqer's flat guest order fields", () => {
    const payload = picqerOrderPayload({ orderNumber: "1", notes: null, contactName: "Ada", companyName: "Co", email: "a@b.test",
      shippingAddress: JSON.stringify({ name: "Ada", line1: "Street 1", postal_code: "1234", city: "City", country: "NL" }),
      products: [{ sku: "SKU-1", name: "Part", quantity: 2, unit_price: "12.00" }] });
    expect(payload).toMatchObject({ idcustomer: null, deliveryaddress: "Street 1", reference: "FERRY-1", products: [{ productcode: "SKU-1", amount: 2 }] });
    expect(picqerOrderPayload({ orderNumber: "1", notes: null, contactName: "Ada", companyName: "", email: "a@b.test", shippingAddress: "not-json", products: [] })).toBeNull();
  });
  it("sums the documented warehouse free stock and refuses invalid values", () => {
    expect(picqerFreeStock({ productcode: "SKU", stock: [{ freestock: 2 }, { freestock: 3 }] })).toBe(5);
    expect(picqerFreeStock({ productcode: "SKU", stock: [{ freestock: -1 }] })).toBeNull();
    expect(picqerFreeStock({ productcode: "SKU", free_stock: 4 })).toBe(4);
  });
});