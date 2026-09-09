import { describe, expect, it, vi } from "vitest";
import { processConceptIfNeeded } from "./picqer";
import { applyFulfilmentVersion, nativeSellableStock, reservationRemainsLocal, stockEventIsNewer } from "./nativeRelay";

describe("Picqer worker remote phase", () => {
  it("renews ownership before processing and propagates process failure", async () => {
    const calls: string[] = [];
    const renew = vi.fn(async () => { calls.push("renew"); return true; });
    const post = vi.fn(async () => { calls.push("process"); throw new Error("process failed"); });
    await expect(processConceptIfNeeded(41, "concept", renew, post)).rejects.toThrow("process failed");
    expect(calls).toEqual(["renew", "process"]);
  });
  it("performs no remote write after ownership loss", async () => {
    const post = vi.fn(async () => undefined);
    await expect(processConceptIfNeeded(41, "concept", async () => false, post)).rejects.toThrow("ownership lost");
    expect(post).not.toHaveBeenCalled();
  });
  it("does not reprocess an already processing recovery", async () => {
    const post = vi.fn(async () => undefined);
    await processConceptIfNeeded(41, "processing", async () => true, post);
    expect(post).not.toHaveBeenCalled();
  });
});

describe("native stock behavior", () => {
  it("subtracts only reservations not acknowledged by Picqer", () => {
    expect(nativeSellableStock(8, 1)).toBe(7);
    expect(nativeSellableStock(8, 0)).toBe(8);
  });
  it("keeps reservation subtraction when recovery mapping exists but processing failed", () => {
    expect(reservationRemainsLocal(true, false)).toBe(true);
    expect(reservationRemainsLocal(true, true)).toBe(false);
  });
  it("feed ordering cannot regress a processed acknowledgement", () => {
    const acknowledged = { version: 2, reservationAcknowledged: true };
    const recoveryOnly = { version: 1, reservationAcknowledged: false };
    expect(applyFulfilmentVersion(acknowledged, recoveryOnly)).toEqual(acknowledged);
    expect(applyFulfilmentVersion(recoveryOnly, acknowledged)).toEqual(acknowledged);
  });
  it("rejects stale and equal warehouse events", () => {
    const current = new Date("2026-01-02T00:00:00Z");
    expect(stockEventIsNewer(current, new Date("2026-01-01T00:00:00Z"))).toBe(false);
    expect(stockEventIsNewer(current, new Date("2026-01-02T00:00:00Z"))).toBe(false);
    expect(stockEventIsNewer(current, new Date("2026-01-03T00:00:00Z"))).toBe(true);
  });
});