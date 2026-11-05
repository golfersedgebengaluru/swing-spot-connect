// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";

const user = "00000000-0000-0000-0000-000000000001";
const booking = "00000000-0000-0000-0000-000000000002";
const sale = "00000000-0000-0000-0000-000000000003";
const invoice = "00000000-0000-0000-0000-000000000004";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION is_admin_or_site_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${invoice}'::uuid $$;
    CREATE FUNCTION has_city_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $2='Bengaluru' $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY,user_id uuid,points int,updated_at timestamptz);
    CREATE TABLE bookings(id uuid PRIMARY KEY,user_id uuid,status text,city text,start_time timestamptz,end_time timestamptz,updated_at timestamptz,note text,corporate_account_id uuid,billing_status text);
    CREATE TABLE points_transactions(user_id uuid,type text,points int,description text,booking_id uuid,created_by uuid,event_type text,reason text);
    CREATE TABLE admin_config(key text,value text); CREATE TABLE bay_config(city text,cancellation_fee_pct numeric);
    CREATE TABLE revenue_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid,user_id uuid,amount numeric,transaction_type text,status text,source_ref text UNIQUE,original_transaction_id uuid,currency text,city text,description text,guest_name text,guest_email text,guest_phone text,product_id uuid,gateway_name text,revenue_date date,metadata jsonb);
    CREATE TABLE financial_years(id uuid PRIMARY KEY,is_active boolean,city text);
    CREATE TABLE invoices(id uuid PRIMARY KEY,invoice_number text UNIQUE,invoice_date date,financial_year_id uuid,invoice_type text,status text,total numeric,business_gstin text,city text,credit_note_for uuid,revenue_transaction_id uuid,credit_note_disposition text,created_at timestamptz,updated_at timestamptz,notes text,due_date date);
    CREATE TABLE invoice_line_items(id uuid PRIMARY KEY,invoice_id uuid,item_name text,line_total numeric,quantity numeric,created_at timestamptz);
    CREATE TABLE advance_transactions(customer_id uuid,amount numeric,transaction_type text,source_type text,source_id uuid,description text,city text,created_by uuid);
    CREATE SEQUENCE cn_sequence; CREATE FUNCTION get_next_invoice_number(text,uuid,text,int,text) RETURNS text LANGUAGE sql AS $$ SELECT 'CN/'||nextval('cn_sequence') $$;
    CREATE FUNCTION injected_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected failure'; END $$;`);
  await db.exec(readFileSync("supabase/migrations/20260426134936_2cb8a231-0f8c-4d16-8b4e-443ec9de28cd.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20260909131704_7440667c-42ed-4c4c-91a0-3807bb0b4053.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0012_atomic_paid_booking_cancellation.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0013_restrict_cancellation_receipt_grants.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`TRUNCATE booking_cancellation_receipts,bookings,profiles,points_transactions,revenue_transactions,invoices,invoice_line_items,advance_transactions,financial_years,admin_config,bay_config CASCADE;
    INSERT INTO profiles VALUES('${user}','${user}',20,now());
    INSERT INTO bookings VALUES('${booking}','${user}','confirmed','Bengaluru',now()+interval '48 hours',now()+interval '50 hours',now(),NULL,NULL,'immediate');
    INSERT INTO revenue_transactions(id,booking_id,user_id,amount,transaction_type,status,currency,city) VALUES('${sale}','${booking}','${user}',1250,'guest_booking','confirmed','INR','Bengaluru');
    INSERT INTO financial_years VALUES('${invoice}',true,'Bengaluru');
    INSERT INTO invoices(id,invoice_number,invoice_type,status,total,business_gstin,city,revenue_transaction_id) VALUES('${invoice}','INV/1','invoice','issued',1250,'GSTIN','Bengaluru','${sale}');
    INSERT INTO invoice_line_items VALUES('${invoice}','${invoice}','Bay session',1250,1,now());
    INSERT INTO points_transactions(user_id,type,points,booking_id) VALUES('${user}','allocation',5,'${booking}');`);
});
async function cancel(option = "advance_credit", actor = user, admin = false) {
  return (await db.query<{ result: Record<string, unknown> | null }>(`SELECT cancel_paid_booking_atomic('${booking}','${actor}','${option}',${admin}) AS result`)).rows[0].result;
}
async function state() {
  return (await db.query(`SELECT (SELECT status FROM bookings) AS booking,
    (SELECT status FROM invoices WHERE id='${invoice}') AS invoice,
    (SELECT points FROM profiles) AS points,
    (SELECT count(*)::int FROM advance_transactions) AS credits,
    (SELECT count(*)::int FROM revenue_transactions WHERE transaction_type='refund') AS refunds,
    (SELECT count(*)::int FROM invoices WHERE invoice_type='credit_note') AS notes,
    (SELECT count(*)::int FROM booking_cancellation_receipts) AS receipts`)).rows[0];
}
describe("atomic paid cancellation", () => {
  it("commits exactly ₹1,250 credit, one signed reversal and complete credit-note lines without granting hours", async () => {
    expect(await cancel()).toMatchObject({ success: true, credit_amount: 1250, hours_refunded: 0, points_clawed_back: 5 });
    expect(await state()).toEqual({ booking: "cancelled", invoice: "cancelled", points: 15, credits: 1, refunds: 1, notes: 1, receipts: 1 });
    expect((await db.query(`SELECT amount,currency,city,original_transaction_id FROM revenue_transactions WHERE transaction_type='refund'`)).rows[0]).toEqual({ amount: "-1250", currency: "INR", city: "Bengaluru", original_transaction_id: sale });
    expect((await db.query(`SELECT line_total,quantity FROM invoice_line_items WHERE invoice_id<>'${invoice}'`)).rows).toEqual([{ line_total: "1250", quantity: "1" }]);
  });
  for (const table of ["advance_transactions", "invoices", "invoice_line_items", "booking_cancellation_receipts"]) {
    it(`rolls back booking, points, refund and documents when ${table} insertion fails`, async () => {
      const before = await state();
      await db.exec(`CREATE TRIGGER fail_insert BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION injected_failure()`);
      try { await expect(cancel()).rejects.toThrow("Injected failure"); expect(await state()).toEqual(before); }
      finally { await db.exec(`DROP TRIGGER fail_insert ON ${table}`); }
      expect(await cancel()).toMatchObject({ credit_amount: 1250 });
    });
  }
  it("replays committed results without a second credit even if the retry changes option", async () => {
    await cancel();
    expect(await cancel("external_refund")).toMatchObject({ already_cancelled: true, disposition: "advance_credit", credit_amount: 1250 });
    expect(await state()).toMatchObject({ credits: 1, refunds: 1, notes: 1 });
  });
  it("serializes simultaneous submissions into one credit", async () => {
    const results = await Promise.all([cancel(), cancel()]);
    expect(results.filter(r => r?.already_cancelled).length).toBe(1);
    expect(await state()).toMatchObject({ credits: 1, refunds: 1, notes: 1 });
  });
  it("rejects another customer's request without any writes", async () => {
    const before = await state(); await expect(cancel("advance_credit", sale)).rejects.toThrow("Booking not found"); expect(await state()).toEqual(before);
  });
  it("requires administrator city authorization", async () => {
    await expect(cancel("advance_credit", sale, true)).rejects.toThrow("Administrator city access required");
    await db.exec(`UPDATE bookings SET city='Chennai'`);
    await expect(cancel("advance_credit", invoice, true)).rejects.toThrow("Administrator city access required");
  });
  it("enforces the configured 24-hour boundary with exact equality allowed", async () => {
    await db.exec(`BEGIN; UPDATE bookings SET start_time=now()+interval '24 hours',end_time=now()+interval '26 hours';`);
    try { expect(await cancel()).toMatchObject({ success: true }); } finally { await db.exec("ROLLBACK"); }
    await db.exec(`UPDATE bookings SET start_time=now()+interval '24 hours'-interval '1 second'`);
    await expect(cancel()).rejects.toThrow("24 hours"); expect(await state()).toMatchObject({ booking: "confirmed", credits: 0 });
  });
  it("preserves administrator window bypass but never permits ended bookings", async () => {
    await db.exec(`UPDATE bookings SET start_time=now()+interval '1 hour'`);
    expect(await cancel("advance_credit", invoice, true)).toMatchObject({ success: true });
  });
  it("refuses ended sessions", async () => {
    await db.exec(`UPDATE bookings SET end_time=now()-interval '1 second'`);
    await expect(cancel("advance_credit", invoice, true)).rejects.toThrow("no longer");
  });
  it("keeps the existing 10% external refund fee and never posts advance credit", async () => {
    expect(await cancel("external_refund")).toMatchObject({ refund_amount: 1125, credit_amount: 0 });
    expect(await state()).toMatchObject({ booking: "cancelled", invoice: "issued", credits: 0, notes: 0, refunds: 1 });
  });
  it("does not enter the paid flow for manual sales or hours-only bookings", async () => {
    await db.exec(`UPDATE revenue_transactions SET transaction_type='booking'`);
    expect(await cancel()).toBeNull(); expect(await state()).toMatchObject({ booking: "confirmed", credits: 0 });
    await db.exec(`DELETE FROM revenue_transactions`); expect(await cancel()).toBeNull();
  });
  it("rejects missing invoice evidence and existing partial refunds before changing anything", async () => {
    await db.exec(`DELETE FROM invoices`); await expect(cancel()).rejects.toThrow("Missing or ambiguous");
    await db.exec(`INSERT INTO revenue_transactions(original_transaction_id,transaction_type,status,amount) VALUES('${sale}','refund','confirmed',-50)`);
    await expect(cancel()).rejects.toThrow("Existing refund"); expect(await state()).toMatchObject({ booking: "confirmed", credits: 0 });
  });
  it("does not auto-repair an old cancelled booking or invent credit on retry", async () => {
    await db.exec(`UPDATE bookings SET status='cancelled'`);
    await expect(cancel()).rejects.toThrow("financial review"); expect(await state()).toMatchObject({ credits: 0, receipts: 0 });
  });
  it("rejects store credit without a resolvable matching account", async () => {
    await db.exec(`UPDATE revenue_transactions SET user_id=NULL`);
    await expect(cancel()).rejects.toThrow("No member account");
  });
  it("keeps the operation and receipts unavailable to ordinary client roles", async () => {
    expect((await db.query(`SELECT has_function_privilege('authenticated','cancel_paid_booking_atomic(uuid,uuid,text,boolean)','EXECUTE') AS call,has_table_privilege('authenticated','booking_cancellation_receipts','SELECT') AS read`)).rows[0]).toEqual({ call: false, read: false });
  });
});