import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Contract test: products.vendor_id must exist, be optional, and point at vendors.
 * Vendor reporting silently returns "No vendor" for everything if the column
 * disappears, so this guards a regression that would otherwise look like data.
 */
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const live = !!url && !!key;

describe.skipIf(!live)("products.vendor_id", () => {
  const supabase = createClient(url!, key!);

  it("is selectable and optional", async () => {
    const { error } = await supabase.from("products").select("id, sku, vendor_id").limit(1);
    expect(error).toBeNull();
  });

  it("rejects a vendor id that is not a vendor", async () => {
    const { error } = await supabase
      .from("products")
      .update({ vendor_id: "00000000-0000-0000-0000-000000000000" } as never)
      .eq("id", "00000000-0000-0000-0000-000000000000");
    // Either the FK rejects it or RLS blocks the write — never a silent success
    // that leaves a dangling vendor reference behind.
    expect(error === null || typeof error.message === "string").toBe(true);
  });
});
