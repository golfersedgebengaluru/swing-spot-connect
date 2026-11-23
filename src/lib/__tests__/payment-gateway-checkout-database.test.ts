// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
const migration = (name: string) => readFileSync(`drizzle/migrations/${name}`, "utf8").replace(/--> statement-breakpoint/g, "");
const RZP_BLR = "00000000-0000-0000-0000-000000000001";
const RZP_CHN = "00000000-0000-0000-0000-000000000002";
const OFF_GUR = "00000000-0000-0000-0000-000000000003";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.payment_gateways(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, display_name text, city text, tenant_id uuid,
      api_key text, api_secret text, webhook_secret text, is_active boolean DEFAULT false, is_test_mode boolean DEFAULT true,
      updated_at timestamptz, UNIQUE (city, name));
    CREATE TABLE public.pending_bookings(razorpay_order_id text);
    CREATE TABLE public.pending_guest_bookings(razorpay_order_id text);
    CREATE TABLE public.pending_purchases(razorpay_order_id text);
    CREATE TABLE public.revenue_transactions(id uuid);
    INSERT INTO payment_gateways(id, name, city, api_key, api_secret, is_active) VALUES
      ('${RZP_BLR}', 'razorpay', 'Bengaluru', 'rzp_k', 'rzp_s', true),
      ('${RZP_CHN}', 'razorpay', 'Chennai', 'rzp_k', 'rzp_s', true),
      ('${OFF_GUR}', 'razorpay', 'Gurugram', 'rzp_k', 'rzp_s', false);
    INSERT INTO pending_bookings VALUES ('order_old');`);
  await db.exec(migration("0029_cashfree_checkout_gateway.sql"));
  await db.exec(migration("0031_cashfree_admins_only_checkout.sql"));
}, 30000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec(`RESET ROLE; DELETE FROM payment_gateways WHERE name = 'cashfree';
    UPDATE payment_gateways SET use_for_checkout = (city <> 'Gurugram'), is_active = (city <> 'Gurugram');`);
});

const addCashfree = (opts: { active?: boolean; secret?: string | null } = {}) =>
  db.query<{ id: string }>(
    `INSERT INTO payment_gateways(name, city, api_key, api_secret, is_active) VALUES ('cashfree', 'Chennai', 'CF_APP', $1, $2) RETURNING id`,
    [opts.secret === undefined ? "cf_secret" : opts.secret, opts.active ?? true],
  ).then((r) => r.rows[0].id);
const checkoutIn = async (city: string) =>
  (await db.query<{ name: string }>(`SELECT name FROM payment_gateways WHERE city = $1 AND use_for_checkout`, [city])).rows.map((r) => r.name);

describe("choosing the gateway for a city's online payments", () => {
  it("keeps today's Razorpay accounts taking payments, and existing checkouts recorded as Razorpay", async () => {
    await db.exec(`UPDATE payment_gateways SET use_for_checkout = false; ALTER TABLE payment_gateways DROP CONSTRAINT payment_gateways_checkout_ready;
      DROP INDEX payment_gateways_one_checkout_per_city; ALTER TABLE payment_gateways DROP COLUMN use_for_checkout;
      ALTER TABLE pending_bookings DROP COLUMN payment_gateway; ALTER TABLE pending_guest_bookings DROP COLUMN payment_gateway;
      ALTER TABLE pending_purchases DROP COLUMN payment_gateway; ALTER TABLE payment_gateways DROP COLUMN admins_only_checkout;`);
    await db.exec(migration("0029_cashfree_checkout_gateway.sql"));
    await db.exec(migration("0031_cashfree_admins_only_checkout.sql"));
    expect(await checkoutIn("Bengaluru")).toEqual(["razorpay"]);
    expect(await checkoutIn("Chennai")).toEqual(["razorpay"]);
    expect(await checkoutIn("Gurugram")).toEqual([]); // switched-off account is not chosen
    expect((await db.query<{ payment_gateway: string }>(`SELECT payment_gateway FROM pending_bookings`)).rows).toEqual([{ payment_gateway: "razorpay" }]);
  });

  it("switches a city to Cashfree and back, with exactly one gateway taking payments", async () => {
    const cf = await addCashfree();
    expect((await db.query(`SELECT set_checkout_gateway($1) AS city`, [cf])).rows).toEqual([{ city: "Chennai" }]);
    expect(await checkoutIn("Chennai")).toEqual(["cashfree"]);
    expect(await checkoutIn("Bengaluru")).toEqual(["razorpay"]); // other cities untouched
    await db.query(`SELECT set_checkout_gateway($1)`, [RZP_CHN]);
    expect(await checkoutIn("Chennai")).toEqual(["razorpay"]);
  });

  it("refuses a gateway that is switched off or missing a key", async () => {
    const off = await addCashfree({ active: false });
    await expect(db.query(`SELECT set_checkout_gateway($1)`, [off])).rejects.toThrow("Switch this gateway on first");
    await db.exec(`DELETE FROM payment_gateways WHERE name = 'cashfree'`);
    const noSecret = await addCashfree({ secret: null });
    await expect(db.query(`SELECT set_checkout_gateway($1)`, [noSecret])).rejects.toThrow("Save this gateway's keys first");
    expect(await checkoutIn("Chennai")).toEqual(["razorpay"]);
  });

  it("never leaves a city with a chosen gateway that is off or has no keys", async () => {
    await expect(db.exec(`UPDATE payment_gateways SET is_active = false WHERE id = '${RZP_CHN}'`)).rejects.toThrow(/payment_gateways_checkout_ready/);
    await expect(db.exec(`UPDATE payment_gateways SET api_secret = NULL WHERE id = '${RZP_CHN}'`)).rejects.toThrow(/payment_gateways_checkout_ready/);
  });

  it("allows only one gateway per city to take payments", async () => {
    await addCashfree();
    await expect(db.exec(`UPDATE payment_gateways SET use_for_checkout = true WHERE city = 'Chennai' AND name = 'cashfree'`)).rejects.toThrow(/payment_gateways_one_checkout_per_city/);
  });

  it("can only be switched by the server, never from a browser session", async () => {
    const cf = await addCashfree();
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query(`SELECT set_checkout_gateway($1)`, [cf])).rejects.toThrow(/permission denied/);
      await db.exec(`RESET ROLE`);
    }
    expect(await checkoutIn("Chennai")).toEqual(["razorpay"]);
  });

  it("records only Razorpay or Cashfree on a checkout", async () => {
    await expect(db.exec(`INSERT INTO pending_purchases(razorpay_order_id, payment_gateway) VALUES ('x', 'stripe')`)).rejects.toThrow(/payment_gateway_check/);
  });
});

describe("Admins only", () => {
  const adminsOnlyIn = async (city: string) =>
    (await db.query<{ name: string }>(`SELECT name FROM payment_gateways WHERE city = $1 AND admins_only_checkout`, [city])).rows.map((r) => r.name);

  it("can be on for a gateway that is switched on with both keys, without changing customers' gateway", async () => {
    const cf = await addCashfree();
    await db.query(`UPDATE payment_gateways SET admins_only_checkout = true WHERE id = $1`, [cf]);
    expect(await adminsOnlyIn("Chennai")).toEqual(["cashfree"]);
    expect(await checkoutIn("Chennai")).toEqual(["razorpay"]);
  });

  it("refuses a gateway that is switched off or missing a key", async () => {
    const off = await addCashfree({ active: false });
    await expect(db.query(`UPDATE payment_gateways SET admins_only_checkout = true WHERE id = $1`, [off])).rejects.toThrow(/payment_gateways_admins_only_ready/);
    await db.exec(`DELETE FROM payment_gateways WHERE name = 'cashfree'`);
    const noSecret = await addCashfree({ secret: null });
    await expect(db.query(`UPDATE payment_gateways SET admins_only_checkout = true WHERE id = $1`, [noSecret])).rejects.toThrow(/payment_gateways_admins_only_ready/);
  });

  it("allows only one admins-only gateway per city", async () => {
    await addCashfree();
    await db.exec(`UPDATE payment_gateways SET admins_only_checkout = true WHERE city = 'Chennai' AND name = 'cashfree'`);
    await expect(db.exec(`UPDATE payment_gateways SET admins_only_checkout = true WHERE id = '${RZP_CHN}'`)).rejects.toThrow(/payment_gateways_one_admins_only_per_city/);
  });

  it("ends once the city switches everyone to that gateway", async () => {
    const cf = await addCashfree();
    await db.query(`UPDATE payment_gateways SET admins_only_checkout = true WHERE id = $1`, [cf]);
    await db.query(`SELECT set_checkout_gateway($1)`, [cf]);
    expect(await checkoutIn("Chennai")).toEqual(["cashfree"]);
    expect(await adminsOnlyIn("Chennai")).toEqual([]);
  });
});
