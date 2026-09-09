import crypto from "node:crypto";

/** Picqer signs the exact, unparsed HTTP body using base64(HMAC-SHA256). */
export function verifyPicqerSignature(raw: Buffer, supplied: string | undefined, secret = process.env.PICQER_WEBHOOK_SECRET ?? ""): boolean {
  if (!supplied || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest();
  let received: Buffer;
  try { received = Buffer.from(supplied, "base64"); } catch { return false; }
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export function timingSafeSecretEqual(expected: string, received: string | undefined): boolean {
  if (!expected || !received || expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}