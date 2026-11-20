// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";

const staff = "00000000-0000-0000-0000-0000000000aa";
const member = "00000000-0000-0000-0000-000000000001";
const birdie = "00000000-0000-0000-0000-0000000000b1";
const glove = "00000000-0000-0000-0000-0000000000b2";
const fy = "00000000-0000-0000-0000-0000000000f1";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE actor(id uuid); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM actor LIMIT 1 $$;
    CREATE SCHEMA cron; CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
    CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${staff}'::uuid AND $2='admin' $$;
    CREATE FUNCTION is_admin_or_site_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${staff}'::uuid $$;
    CREATE FUNCTION has_city_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${staff}'::uuid $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,display_name text,email text,phone text,preferred_city text,user_type text);
    CREATE TABLE products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,description text,category text,item_type text,in_stock boolean,sku text,unit_of_measure text,price numeric,hsn_code text,sac_code text,gst_rate numeric,opening_stock numeric,reorder_level numeric,reorder_quantity numeric,duration_minutes int,bookable boolean,city text,corporate_account_id uuid,badge text,sizes text[],colors text[],sort_order int,image_url text,created_at timestamptz,updated_at timestamptz,legacy_sku text,vendor_id uuid);
    CREATE TABLE hour_packages(id uuid PRIMARY KEY);
    CREATE TABLE pending_purchases(razorpay_order_id text UNIQUE,package_label text,status text,hours_transaction_id uuid,revenue_transaction_id uuid,updated_at timestamptz);
    CREATE TABLE bay_config(city text UNIQUE,timezone text);
    CREATE TABLE hours_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type text,hours numeric,note text,reason text,created_by uuid,booking_id uuid,
      CONSTRAINT hours_transactions_type_check CHECK (type IN ('purchase','deduction','adjustment','refund','credit')));
    CREATE TABLE member_hours(user_id uuid PRIMARY KEY,hours_purchased numeric DEFAULT 0,hours_used numeric DEFAULT 0,updated_at timestamptz);
    CREATE TABLE revenue_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,amount numeric,transaction_type text,status text,source_ref text UNIQUE,original_transaction_id uuid,currency text,city text,description text,guest_name text,guest_email text,guest_phone text,product_id uuid,gateway_name text,revenue_date date,metadata jsonb,booking_id uuid,hours_transaction_id uuid,gateway_order_ref text,gateway_payment_ref text UNIQUE,created_at timestamptz DEFAULT now());
    CREATE FUNCTION record_revenue(p_source_ref text,p_transaction_type text,p_amount numeric,p_description text,p_city text,p_user_id uuid,p_gateway_name text,p_revenue_date date,p_metadata jsonb) RETURNS uuid LANGUAGE sql AS $$
      INSERT INTO revenue_transactions(source_ref,transaction_type,amount,description,city,user_id,gateway_name,revenue_date,metadata,status) VALUES(p_source_ref,p_transaction_type,p_amount,p_description,p_city,p_user_id,p_gateway_name,p_revenue_date,p_metadata,'confirmed') RETURNING id $$;
    CREATE FUNCTION record_refund(p_source_ref text,p_original_transaction_id uuid,p_amount numeric,p_description text,p_gateway_name text,p_revenue_date date,p_metadata jsonb) RETURNS uuid LANGUAGE sql AS $$
      INSERT INTO revenue_transactions(source_ref,transaction_type,amount,original_transaction_id,city,description,gateway_name,revenue_date,metadata,status)
      SELECT p_source_ref,'refund',-p_amount,id,city,p_description,p_gateway_name,p_revenue_date,p_metadata,'confirmed' FROM revenue_transactions WHERE id=p_original_transaction_id
      ON CONFLICT (source_ref) DO UPDATE SET source_ref=EXCLUDED.source_ref RETURNING id $$;
    CREATE TABLE financial_years(id uuid PRIMARY KEY,is_active boolean,city text);
    CREATE TABLE gst_profiles(city text,gstin text,is_gst_registered boolean,invoice_prefix text,invoice_start_number int,legal_name text,address text,state text,state_code text);
    CREATE TABLE bays(id uuid,city text); CREATE TABLE bookings(id uuid DEFAULT gen_random_uuid(),user_id uuid,city text,start_time timestamptz,end_time timestamptz,duration_minutes int,status text,session_type text,bay_id uuid,coach_name text,note text,invoice_id uuid,manual_invoice_origin_id uuid);
    CREATE TABLE invoices(id uuid PRIMARY KEY,invoice_number text UNIQUE,invoice_date date,financial_year_id uuid,invoice_type text,status text,subtotal numeric,cgst_total numeric,sgst_total numeric,igst_total numeric,total numeric,amount_paid numeric,payment_status text,payment_method text,discount_type text,discount_value numeric,discount_amount numeric,business_name text,business_gstin text,business_address text,business_state text,business_state_code text,customer_user_id uuid,customer_name text,city text,credit_note_for uuid,revenue_transaction_id uuid,credit_note_disposition text,invoice_category text,created_at timestamptz,updated_at timestamptz,notes text,due_date date);
    CREATE TABLE invoice_line_items(id uuid PRIMARY KEY,invoice_id uuid,item_name text,quantity numeric,unit_price numeric,line_total numeric,gst_rate numeric,cgst_amount numeric,sgst_amount numeric,igst_amount numeric,product_id uuid,sort_order int,created_at timestamptz);
    CREATE SEQUENCE doc_seq START 1061; CREATE FUNCTION get_next_invoice_number(text,uuid,text,int,text) RETURNS text LANGUAGE sql AS $$ SELECT $3||'/'||nextval('doc_seq') $$;`);
  await db.exec(readFileSync("drizzle/migrations/0026_membership_validity_and_hours.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0027_membership_pre_gst_spread.sql", "utf8"));
  await db.exec(`CREATE TABLE payment_gateways(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,city text,tenant_id uuid,api_key text,api_secret text,is_active boolean,updated_at timestamptz);
    CREATE TABLE pending_bookings(razorpay_order_id text); CREATE TABLE pending_guest_bookings(razorpay_order_id text);`);
  await db.exec(readFileSync("drizzle/migrations/0029_cashfree_checkout_gateway.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
}, 30000);
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec(`TRUNCATE actor,profiles,products,member_hours,hours_transactions,revenue_transactions,memberships,invoices,invoice_line_items,financial_years,gst_profiles,bay_config,pending_purchases CASCADE;
    INSERT INTO actor VALUES('${staff}');
    INSERT INTO profiles(id,user_id,display_name) VALUES('${member}','${member}','Rohan');
    INSERT INTO products(id,name,price,gst_rate) VALUES('${birdie}','Birdie',25000,18),('${glove}','Glove',2000,18);
    UPDATE products SET membership_validity_months=3, membership_hours=25 WHERE id='${birdie}';
    INSERT INTO financial_years VALUES('${fy}',true,'Bengaluru');
    INSERT INTO gst_profiles VALUES('Bengaluru','29ABC',true,'INV',1,'GE','addr','Karnataka','29');
    INSERT INTO bay_config VALUES('Bengaluru','Asia/Kolkata'); ALTER SEQUENCE doc_seq RESTART WITH 1061;`);
});

async function sellInPerson(lines: { product: string; total: number; startsOn?: string }[], invoiceDate = "2026-09-01") {
  const op = crypto.randomUUID();
  const total = lines.reduce((s, l) => s + l.total, 0);
  await db.query(`SELECT create_manual_invoice_atomic($1,$2::jsonb,$3::jsonb)`, [op,
    JSON.stringify({ city: "Bengaluru", invoice_date: invoiceDate, customer_user_id: member, customer_name: "Rohan", total, invoice_category: "purchase", invoice_type: "invoice" }),
    JSON.stringify(lines.map((l, i) => ({ item_name: "x", quantity: 1, unit_price: l.total, line_total: l.total, cgst_amount: round(l.total * 9 / 118), sgst_amount: round(l.total * 9 / 118), igst_amount: 0, product_id: l.product, sort_order: i, membership_starts_on: l.startsOn })))]);
  return op;
}
const round = (n: number) => Math.round(n * 100) / 100;
const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const balance = async () => one<{ purchased: number; used: number }>(`SELECT hours_purchased::float purchased, hours_used::float used FROM member_hours WHERE user_id=$1`, [member]);

describe("selling a membership in person", () => {
  it("adds the membership's hours and records its validity", async () => {
    await sellInPerson([{ product: birdie, total: 25000 }]);
    expect(await balance()).toEqual({ purchased: 25, used: 0 });
    const m = await one<any>(`SELECT starts_on::text, ends_on::text, amount::float, hours::float, hours_remaining::float FROM memberships`);
    expect(m).toEqual({ starts_on: "2026-09-01", ends_on: "2026-11-30", amount: 25000, hours: 25, hours_remaining: 25 });
  });

  it("records the value before GST from the invoice line", async () => {
    await sellInPerson([{ product: birdie, total: 25000 }]);
    const m = await one<any>(`SELECT taxable_amount::float t, gst_amount::float g FROM memberships`);
    expect(m).toEqual({ t: 21186.44, g: 3813.56 });
  });

  it("lets staff choose a later start date", async () => {
    await sellInPerson([{ product: birdie, total: 25000, startsOn: "2026-10-15" }]);
    const m = await one<any>(`SELECT sold_on::text, starts_on::text, ends_on::text FROM memberships`);
    expect(m).toEqual({ sold_on: "2026-09-01", starts_on: "2026-10-15", ends_on: "2027-01-14" });
  });

  it("refuses a start date before the sale", async () => {
    await expect(sellInPerson([{ product: birdie, total: 25000, startsOn: "2026-08-01" }])).rejects.toThrow(/before the sale date/);
    expect((await db.query(`SELECT 1 FROM invoices`)).rows).toHaveLength(0);
  });

  it("gives the membership only its own line's share of a mixed invoice", async () => {
    await sellInPerson([{ product: birdie, total: 25000 }, { product: glove, total: 2000 }]);
    expect((await one<any>(`SELECT amount::float a FROM memberships`)).a).toBe(25000);
  });

  it("does not create a membership for items without a validity period", async () => {
    await sellInPerson([{ product: glove, total: 2000 }]);
    expect((await db.query(`SELECT 1 FROM memberships`)).rows).toHaveLength(0);
    expect(await balance()).toBeUndefined();
  });
});

describe("using and expiring membership hours", () => {
  it("uses the soonest-ending membership's hours first", async () => {
    await sellInPerson([{ product: birdie, total: 25000, startsOn: "2026-10-01" }]);
    await sellInPerson([{ product: birdie, total: 25000 }]);
    await db.exec(`UPDATE member_hours SET hours_used=hours_used+10 WHERE user_id='${member}'`);
    const rows = (await db.query<any>(`SELECT starts_on::text s, hours_remaining::float r FROM memberships ORDER BY starts_on`)).rows;
    expect(rows).toEqual([{ s: "2026-09-01", r: 15 }, { s: "2026-10-01", r: 25 }]);
    await db.exec(`UPDATE member_hours SET hours_used=hours_used-4 WHERE user_id='${member}'`);
    expect((await one<any>(`SELECT hours_remaining::float r FROM memberships WHERE starts_on='2026-09-01'`)).r).toBe(19);
  });

  it("keeps unused hours after expiry while the city switch is off", async () => {
    await sellInPerson([{ product: birdie, total: 25000 }], "2026-01-01");
    await db.exec(`SELECT expire_membership_hours()`);
    expect(await balance()).toEqual({ purchased: 25, used: 0 });
    expect((await one<any>(`SELECT hours_state FROM memberships`)).hours_state).toBe("kept");
  });

  it("removes unused hours after expiry when the city switch is on", async () => {
    await db.exec(`UPDATE bay_config SET membership_hours_auto_expire=true`);
    await sellInPerson([{ product: birdie, total: 25000 }], "2026-01-01");
    await db.exec(`UPDATE member_hours SET hours_used=5 WHERE user_id='${member}'`);
    await db.exec(`SELECT expire_membership_hours()`);
    expect(await balance()).toEqual({ purchased: 25, used: 25 });
    const tx = await one<any>(`SELECT type, hours::float h FROM hours_transactions WHERE type='expired'`);
    expect(tx).toEqual({ type: "expired", h: 20 });
  });

  it("never expires a membership that has not ended", async () => {
    await db.exec(`UPDATE bay_config SET membership_hours_auto_expire=true`);
    await sellInPerson([{ product: birdie, total: 25000 }], new Date().toISOString().slice(0, 10));
    await db.exec(`SELECT expire_membership_hours()`);
    expect((await one<any>(`SELECT hours_state FROM memberships`)).hours_state).toBe("active");
  });
});

describe("cancelling a membership", () => {
  it("refunds, issues one credit note and removes unused hours together", async () => {
    await sellInPerson([{ product: birdie, total: 25000 }]);
    await db.exec(`UPDATE member_hours SET hours_used=5 WHERE user_id='${member}'`);
    const id = (await one<any>(`SELECT id FROM memberships`)).id;
    const res = await one<any>(`SELECT cancel_membership($1,'2026-10-15',10000,'upi','Moving away') r`, [id]);
    expect(res.r.credit_note_number).toBe("CN/1062");
    expect(Number(res.r.hours_removed)).toBe(20);
    const cn = await one<any>(`SELECT total::float t, invoice_type, credit_note_disposition d FROM invoices WHERE invoice_type='credit_note'`);
    expect(cn).toEqual({ t: 10000, invoice_type: "credit_note", d: "external_refund" });
    const refund = await one<any>(`SELECT amount::float a, revenue_date::text d FROM revenue_transactions WHERE transaction_type='refund'`);
    expect(refund).toEqual({ a: -10000, d: "2026-10-15" });
    expect(await balance()).toEqual({ purchased: 25, used: 25 });
    // A second click changes nothing.
    const again = await one<any>(`SELECT cancel_membership($1,'2026-10-15',10000,'upi',NULL) r`, [id]);
    expect(again.r.already_cancelled).toBe(true);
    expect((await db.query(`SELECT 1 FROM invoices WHERE invoice_type='credit_note'`)).rows).toHaveLength(1);
  });

  it("refuses a refund above the membership amount and changes nothing", async () => {
    await sellInPerson([{ product: birdie, total: 25000 }]);
    const id = (await one<any>(`SELECT id FROM memberships`)).id;
    await expect(db.query(`SELECT cancel_membership($1,'2026-10-15',30000,'upi',NULL)`, [id])).rejects.toThrow(/between 0 and the membership amount/);
    expect((await one<any>(`SELECT status FROM memberships`)).status).toBe("active");
  });

  it("is refused for non-staff", async () => {
    await sellInPerson([{ product: birdie, total: 25000 }]);
    const id = (await one<any>(`SELECT id FROM memberships`)).id;
    await db.exec(`UPDATE actor SET id='${member}'`);
    await expect(db.query(`SELECT cancel_membership($1,'2026-10-15',0,NULL,NULL)`, [id])).rejects.toThrow(/Administrator city access required/);
  });

  it("deleting the invoice removes the hours the membership added", async () => {
    await sellInPerson([{ product: birdie, total: 25000 }]);
    await db.exec(`UPDATE revenue_transactions SET status='voided'`);
    expect(await balance()).toEqual({ purchased: 25, used: 25 });
    expect((await one<any>(`SELECT status FROM memberships`)).status).toBe("void");
  });
});

describe("buying a membership package online", () => {
  it("records the membership once and does not add the hours twice", async () => {
    await db.exec(`INSERT INTO pending_purchases(razorpay_order_id,package_label,status,membership_validity_months) VALUES('order_1','Birdie','pending',3)`);
    await db.exec(`UPDATE actor SET id=NULL`);
    await db.query(`SELECT complete_hour_purchase($1,25,30000,'INR','order_1','pay_1','Birdie','Bengaluru')`, [member]);
    await db.query(`SELECT complete_hour_purchase($1,25,30000,'INR','order_1','pay_1','Birdie','Bengaluru')`, [member]);
    expect(await balance()).toEqual({ purchased: 25, used: 0 });
    const m = (await db.query<any>(`SELECT amount::float a, hours::float h, validity_months v FROM memberships`)).rows;
    expect(m).toEqual([{ a: 30000, h: 25, v: 3 }]);
  });

  it("records the gateway that took the money", async () => {
    await db.exec(`INSERT INTO pending_purchases(razorpay_order_id,package_label,status,payment_gateway) VALUES('cf_1','10h','pending','cashfree'),('order_3','10h','pending','razorpay')`);
    await db.query(`SELECT complete_hour_purchase($1,10,5000,'INR','cf_1','111','10h','Chennai')`, [member]);
    await db.query(`SELECT complete_hour_purchase($1,10,5000,'INR','order_3','pay_3','10h','Chennai')`, [member]);
    const rows = (await db.query<{ ref: string; gw: string }>(`SELECT gateway_order_ref ref, gateway_name gw FROM revenue_transactions ORDER BY 1`)).rows;
    expect(rows).toEqual([{ ref: "cf_1", gw: "cashfree" }, { ref: "order_3", gw: "razorpay" }]);
  });

  it("packages without a validity period behave exactly as before", async () => {
    await db.exec(`INSERT INTO pending_purchases(razorpay_order_id,package_label,status) VALUES('order_2','10h','pending')`);
    await db.query(`SELECT complete_hour_purchase($1,10,5000,'INR','order_2','pay_2','10h','Bengaluru')`, [member]);
    expect((await db.query(`SELECT 1 FROM memberships`)).rows).toHaveLength(0);
    expect(await balance()).toEqual({ purchased: 10, used: 0 });
  });
});
