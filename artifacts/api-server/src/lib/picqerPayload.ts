import crypto from "node:crypto";

type Input = { orderNumber: string; shippingAddress: string; notes: string | null; contactName: string; companyName: string; email: string; products: unknown };
const string = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const optionalString = (value: unknown, max: number) => typeof value === "string" ? string(value, max) : "";

export function picqerFreeStock(data: unknown): number | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const value = data as Record<string, unknown>;
  if (typeof value.productcode !== "string" || !string(value.productcode, 190)) return null;
  if (Array.isArray(value.stock) && value.stock.length > 0) {
    let sum = 0;
    for (const warehouse of value.stock) {
      if (!warehouse || typeof warehouse !== "object") return null;
      const free = (warehouse as Record<string, unknown>).freestock;
      if (typeof free !== "number" || !Number.isInteger(free) || free < 0) return null;
      sum += free;
    }
    return sum;
  }
  return typeof value.free_stock === "number" && Number.isInteger(value.free_stock) && value.free_stock >= 0 ? value.free_stock : null;
}

export function picqerWebhookKey(type: string, hookId: string, triggeredAt: string, raw: Buffer): string {
  return crypto.createHash("sha256").update(`${type}|${hookId}|${triggeredAt}|${crypto.createHash("sha256").update(raw).digest("hex")}`).digest("hex");
}
export function picqerOrderId(response: unknown): number | null {
  const value = response && typeof response === "object" ? (response as Record<string, unknown>).idorder : null;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
export function picqerExactReferenceCandidate(response: unknown, reference: string): Record<string, unknown> | null {
  const candidates = Array.isArray(response) ? response : response && typeof response === "object" && Array.isArray((response as Record<string, unknown>).data)
    ? (response as Record<string, unknown>).data as unknown[] : [];
  return (candidates.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).reference === reference) as Record<string, unknown> | undefined) ?? null;
}
export function picqerOrderPayload(input: Input): Record<string, unknown> | null {
  let address: Record<string, unknown>;
  try { address = JSON.parse(input.shippingAddress) as Record<string, unknown>; } catch { return null; }
  if (!address || Array.isArray(address)) return null;
  const get = (...names: string[]) => names.map((name) => address[name]).find((value) => typeof value === "string");
  const name = string(get("name", "contactName", "contact_name") || input.contactName, 140);
  const company = string(get("company", "companyName", "company_name") || input.companyName, 190);
  const line1 = string(get("line1", "address", "deliveryaddress"), 190);
  const line2 = string(get("line2", "address2", "deliveryaddress2"), 190);
  const zip = string(get("postal_code", "zipcode", "deliveryzipcode"), 30);
  const city = string(get("city", "deliverycity"), 100);
  const country = string(get("country", "deliverycountry"), 2).toUpperCase();
  if (!name || !line1 || !zip || !city || !/^[A-Z]{2}$/.test(country) || !Array.isArray(input.products)) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || !input.email || !input.products.length) return null;
  const products = input.products.map((line) => {
    const item = line as Record<string, unknown>;
    const productcode = string(item.sku, 190), amount = item.quantity;
    if (!productcode || typeof amount !== "number" || !Number.isInteger(amount) || amount < 1) return null;
    const rawPrice = item.unit_price;
    const price = typeof rawPrice === "number" ? rawPrice : typeof rawPrice === "string" && rawPrice.trim() !== "" ? Number(rawPrice) : undefined;
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) return null;
    return { productcode, amount, name: string(item.name, 500) || undefined, ...(price === undefined ? {} : { price }) };
  });
  if (products.some((product) => product === null)) return null;
  return { idcustomer: null, deliveryname: company || name, deliverycontactname: name, deliveryaddress: line1, deliveryaddress2: line2,
    deliveryzipcode: zip, deliverycity: city, deliverycountry: country, invoicename: company || name, invoicecontactname: name,
    invoiceaddress: line1, invoiceaddress2: line2, invoicezipcode: zip, invoicecity: city, invoicecountry: country,
    telephone: "", emailaddress: optionalString(input.email, 190), reference: `FERRY-${input.orderNumber}`, customer_remarks: optionalString(input.notes, 4000),
    invoiced: false, products };
}