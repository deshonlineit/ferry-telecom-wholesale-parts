import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { nativeRelayEnabled, nativeRelaySignature } from "./nativeRelay";

describe("native relay cutover gate", () => {
  it("is hard disabled outside production and explicit relay opt-in", () => {
    expect(nativeRelayEnabled({ NODE_ENV: "test", LIVE_INTEGRATIONS: "1", PICQER_RELAY_ENABLED: "1", PICQER_RELAY_SECRET: "x" })).toBe(false);
    expect(nativeRelayEnabled({ NODE_ENV: "production", LIVE_INTEGRATIONS: "1", PICQER_RELAY_ENABLED: "0", PICQER_RELAY_SECRET: "x" })).toBe(false);
    expect(nativeRelayEnabled({ NODE_ENV: "production", LIVE_INTEGRATIONS: "1", PICQER_RELAY_ENABLED: "1", PICQER_RELAY_SECRET: "x" })).toBe(true);
  });
  it("uses one canonical signed GET string for feed requests", () => {
    const raw = Buffer.from("GET /api/native/stock-feed?limit=100&page=1");
    const signature = nativeRelaySignature("1700000000", "stock-1", raw, "secret");
    expect(signature).toBe(crypto.createHmac("sha256", "secret").update("v1.1700000000.stock-1.GET /api/native/stock-feed?limit=100&page=1").digest("hex"));
  });
});