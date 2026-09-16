import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canAccessQcEntry, constantTimeEqual, hashGuestClaim } from "../../../supabase/functions/_shared/qc-entry-access";

const read = (path: string) => readFileSync(resolve(__dirname, "../../../", path), "utf8");

describe("quick competition entry ownership", () => {
  it("does not treat a matching or editable phone as authorization", async () => {
    const entry = { owner_id: "owner-a", guest_claim_hash: null };
    await expect(canAccessQcEntry({ kind: "user", userId: "user-b" }, entry)).resolves.toBe(false);
    expect(read("supabase/migrations/20260916131456_5687a013-a0bc-44b1-832e-a12c750836ee.sql")).not.toContain("p.phone = qc_entries.phone");
  });

  it("allows a signed-in entrant to access only their own entry", async () => {
    const entry = { owner_id: "owner-a", guest_claim_hash: null };
    await expect(canAccessQcEntry({ kind: "user", userId: "owner-a" }, entry)).resolves.toBe(true);
    await expect(canAccessQcEntry({ kind: "user", userId: "owner-b" }, entry)).resolves.toBe(false);
  });

  it("isolates guests with a high-entropy claim rather than phone", async () => {
    const claimA = "a".repeat(64);
    const claimB = "b".repeat(64);
    const entryA = { owner_id: null, guest_claim_hash: await hashGuestClaim(claimA) };
    await expect(canAccessQcEntry({ kind: "guest" }, entryA, claimA)).resolves.toBe(true);
    await expect(canAccessQcEntry({ kind: "guest" }, entryA, claimB)).resolves.toBe(false);
    await expect(canAccessQcEntry({ kind: "guest" }, entryA)).resolves.toBe(false);
  });

  it("compares complete claim hashes", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abc0")).toBe(false);
  });

  it("requires ownership on retry, verification, and minimal status retrieval", () => {
    const create = read("supabase/functions/qc-create-entry-order/index.ts");
    const verify = read("supabase/functions/qc-verify-entry-payment/index.ts");
    const status = read("supabase/functions/qc-get-entry-status/index.ts");
    expect(create).toContain("canAccessQcEntry");
    expect(create).toContain("entry_id === existing.id");
    expect(verify).toContain("canAccessQcEntry");
    expect(verify).toContain('.eq("razorpay_order_id", razorpay_order_id)');
    expect(status).toContain("canAccessQcEntry");
    expect(status).not.toContain("razorpay_payment_id");
    expect(status).not.toContain("phone");
  });
});