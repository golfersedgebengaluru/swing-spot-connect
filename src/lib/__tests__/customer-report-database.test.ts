import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const admin = "00000000-0000-0000-0000-000000000001";
const guest = "00000000-0000-0000-0000-000000000002";
const user = "00000000-0000-0000-0000-000000000003";
const booking = "00000000-0000-0000-0000-000000000004";
const blank = "00000000-0000-0000-0000-000000000005";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.user_id',true),'')::uuid $$;
    CREATE TABLE user_roles(user_id uuid,role text);
    CREATE TABLE site_admin_cities(user_id uuid,city text);
    CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2) $$;
    CREATE FUNCTION has_city_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT has_role($1,'admin') OR EXISTS(SELECT 1 FROM site_admin_cities WHERE user_id=$1 AND city=$2) $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY,user_id uuid,display_name text,email text,phone text,points int,created_at timestamptz,user_type text,preferred_city text,extended_hours_access boolean);
    CREATE TABLE bays(id uuid,city text,currency text);
    CREATE TABLE bookings(id uuid PRIMARY KEY,user_id uuid,parent_booking_id uuid,start_time timestamptz,status text,billing_status text,invoice_id uuid,city text,corporate_account_id uuid);
    CREATE TABLE hours_transactions(user_id uuid,booking_id uuid);
    CREATE TABLE member_hours(id uuid,user_id uuid,hours_purchased numeric,hours_used numeric);
    CREATE TABLE revenue_transactions(id uuid,user_id uuid,booking_id uuid,original_transaction_id uuid,status text,city text,revenue_date date,amount numeric,currency text,gateway_order_ref text);
    CREATE TABLE pending_bookings(booking_id uuid,status text);
    CREATE TABLE pending_guest_bookings(razorpay_order_id text,status text,city text,start_time timestamptz,guest_email text,guest_phone text);
    INSERT INTO user_roles VALUES('${admin}','admin');
    INSERT INTO bays VALUES(null,'Bengaluru','INR'),(null,'Chennai','INR');
    INSERT INTO profiles VALUES('${guest}',null,'Guest','guest@example.test',null,0,now(),'guest','Bengaluru',false),('${blank}',null,'Blank',null,null,0,now(),'guest',null,false);
    INSERT INTO bookings VALUES('${booking}','${guest}',null,'2026-08-31 10:00Z','confirmed','immediate','${booking}','Bengaluru',null);
    INSERT INTO revenue_transactions VALUES('${booking}','${guest}','${booking}',null,'confirmed','Bengaluru','2026-08-31',1000,'INR','order-1'),('${user}','${guest}','${booking}','${booking}','confirmed','Bengaluru','2026-09-01',-200,'INR',null);
    INSERT INTO pending_guest_bookings VALUES('order-1','completed','Bengaluru','2026-08-31 10:00Z','guest@example.test','123');
    INSERT INTO member_hours VALUES('${booking}','${guest}',2,1);
    SET request.user_id='${admin}';`);
  await db.exec(readFileSync("drizzle/migrations/0005_customer_reporting_read_only.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
async function report(args = "_city=>'Bengaluru', _as_of=>'2026-10-30 06:00Z'") {
  const result = await db.query<{ result: { rows: Array<Record<string, any>>; total: number; reconciliation: { linked: number } } }>(`SELECT customer_report(${args}) AS result`);
  return result.rows[0].result;
}
describe("customer reporting database rules", () => {
  it("keeps blank-city non-visitors outside Bengaluru", async () => { expect((await report()).rows.map(r => r.id)).toEqual([guest]); });
  it("subtracts a signed refund once", async () => { expect((await report()).rows[0].lifetime_spend).toEqual({ INR: 800 }); });
  it("uses business revenue dates for period spend", async () => { expect((await report("_city=>'Bengaluru',_from=>'2026-09-01',_to=>'2026-09-30',_as_of=>'2026-10-30Z'")).rows[0].period_spend).toEqual({ INR: -200 }); });
  it("links an online guest through the explicit order and booking", async () => { const value = await report(); expect(value.reconciliation.linked).toBe(1); expect(value.rows[0].booking_channel).toBe("Online"); });
  it("preserves history when a guest claims an account", async () => {
    await db.exec(`UPDATE profiles SET user_id='${user}' WHERE id='${guest}'; UPDATE revenue_transactions SET user_id='${user}' WHERE user_id='${guest}';`);
    const row = (await report()).rows[0]; expect(row.lifetime_spend).toEqual({ INR: 800 }); expect(row.lifetime_visits).toBe(1); expect(row.member_hours_id).toBe(booking);
  });
  it("excludes unpaid and cancelled sessions", async () => {
    const result = await db.query<{ unpaid: boolean; cancelled: boolean }>(`SELECT customer_report_visit('confirmed','2026-10-01Z','immediate',null,false,'2026-10-30Z') AS unpaid,customer_report_visit('cancelled','2026-10-01Z','deferred',null,false,'2026-10-30Z') AS cancelled`);
    expect(result.rows[0]).toEqual({ unpaid: false, cancelled: false });
  });
  it("retains eligible corporate deferred sessions", async () => { const value = await db.query<{ included: boolean }>(`SELECT customer_report_visit('confirmed','2026-10-01Z','deferred',null,false,'2026-10-30Z') AS included`); expect(value.rows[0].included).toBe(true); });
  it("uses the existing one-hour low-hours threshold", async () => { const value = await db.query<{ yes: boolean; no: boolean }>(`SELECT customer_report_preset('low-hours',null,null,null,0,1,null,null,'2026-10-30') AS yes,customer_report_preset('low-hours',null,null,null,0,1.01,null,null,'2026-10-30') AS no`); expect(value.rows[0]).toEqual({ yes: true, no: false }); });
  it("defines inactivity at 60 days and excludes never-visited customers", async () => { const value = await db.query<{ yes: boolean; no: boolean }>(`SELECT customer_report_preset('inactive',null,'2026-08-31',null,0,null,null,null,'2026-10-30') AS yes,customer_report_preset('inactive',null,null,null,0,null,null,null,'2026-10-30') AS no`); expect(value.rows[0]).toEqual({ yes: true, no: false }); });
  it("requires two period visits for the repeat preset", async () => { const value = await db.query<{ yes: boolean; no: boolean }>(`SELECT customer_report_preset('repeat',null,null,null,2,null,null,null,'2026-10-30') AS yes,customer_report_preset('repeat',null,null,null,1,null,null,null,'2026-10-30') AS no`); expect(value.rows[0]).toEqual({ yes: true, no: false }); });
  it("rejects non-admin access", async () => { await db.exec(`SET request.user_id='${blank}'`); await expect(report()).rejects.toThrow("Administrator access required"); await db.exec(`SET request.user_id='${admin}'`); });
  it("rejects a city outside site-admin assignments", async () => { await db.exec(`INSERT INTO user_roles VALUES('${blank}','site_admin'); INSERT INTO site_admin_cities VALUES('${blank}','Chennai'); SET request.user_id='${blank}'`); await expect(report()).rejects.toThrow("Location access denied"); await db.exec(`SET request.user_id='${admin}'`); });
});