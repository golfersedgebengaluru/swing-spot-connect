// @vitest-environment node
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
    CREATE TABLE invoices(id uuid,revenue_transaction_id uuid,invoice_type text);
    CREATE TABLE coaching_sessions(invoice_id uuid,corporate_account_id uuid);
    INSERT INTO user_roles VALUES('${admin}','admin');
    INSERT INTO bays VALUES(null,'Bengaluru','INR'),(null,'Chennai','INR');
    INSERT INTO profiles VALUES('${guest}',null,'Guest','guest@example.test',null,0,now(),'guest','Bengaluru',false),('${blank}',null,'Blank',null,null,0,now(),'guest',null,false);
    INSERT INTO bookings VALUES('${booking}','${guest}',null,'2026-08-31 10:00Z','confirmed','immediate','${booking}','Bengaluru',null);
    INSERT INTO revenue_transactions VALUES('${booking}','${guest}','${booking}',null,'confirmed','Bengaluru','2026-08-31',1000,'INR','order-1'),('${user}','${guest}','${booking}','${booking}','confirmed','Bengaluru','2026-09-01',-200,'INR',null);
    INSERT INTO pending_guest_bookings VALUES('order-1','completed','Bengaluru','2026-08-31 10:00Z','guest@example.test','123');
    INSERT INTO member_hours VALUES('${booking}','${guest}',2,1);
    SET request.user_id='${admin}';`);
  await db.exec(readFileSync("drizzle/migrations/0005_customer_reporting_read_only.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0006_customer_reporting_boundary_guards.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0007_customer_reporting_corporate_invoice_links.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0008_dashboard_customer_attention.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0009_customer_report_sorting.sql", "utf8"));
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
  it("supports first-time visitors without explicitly entered dates", async () => { expect((await report("_city=>'Bengaluru',_preset=>'first-time',_as_of=>'2026-10-30Z'")).total).toBe(1); });
  it("keeps corporate invoice revenue out of personal spend", async () => {
    await db.exec(`INSERT INTO invoices VALUES('${booking}','${booking}','invoice'); INSERT INTO coaching_sessions VALUES('${booking}','${admin}')`);
    expect((await report()).rows[0].lifetime_spend).toEqual({});
    await db.exec(`DELETE FROM invoices WHERE revenue_transaction_id='${booking}'`);
    await db.exec(`DELETE FROM coaching_sessions WHERE invoice_id='${booking}'`);
  });
  it("separates currencies rather than mixing totals", async () => {
    await db.exec(`INSERT INTO revenue_transactions VALUES('${blank}','${user}',null,null,'confirmed','Bengaluru','2026-09-01',10,'USD',null)`);
    expect((await report()).rows[0].lifetime_spend).toEqual({ INR:800,USD:10 });
    await db.exec(`DELETE FROM revenue_transactions WHERE id='${blank}'`);
  });
  it("deduplicates parent-linked visits", async () => {
    await db.exec(`INSERT INTO bookings VALUES('${blank}','${guest}','${booking}','2026-08-31 11:00Z','confirmed','deferred',null,'Bengaluru',null)`);
    expect((await report()).rows[0].lifetime_visits).toBe(1);
    await db.exec(`DELETE FROM bookings WHERE id='${blank}'`);
  });
  it("exports pagination over the same stable result ordering", async () => {
    const first=await report("_limit=>1,_offset=>0,_as_of=>'2026-10-30Z'");
    const second=await report("_limit=>1,_offset=>1,_as_of=>'2026-10-30Z'");
    expect(first.total).toBe(2); expect(second.total).toBe(2); expect(first.rows[0].id).not.toBe(second.rows[0].id);
  });
  it("rejects non-admin access", async () => { await db.exec(`SET request.user_id='${blank}'`); await expect(report()).rejects.toThrow("Administrator access required"); await db.exec(`SET request.user_id='${admin}'`); });
  it("rejects a city outside site-admin assignments", async () => { await db.exec(`INSERT INTO user_roles VALUES('${blank}','site_admin'); INSERT INTO site_admin_cities VALUES('${blank}','Chennai'); SET request.user_id='${blank}'`); await expect(report()).rejects.toThrow("Location access denied"); await db.exec(`SET request.user_id='${admin}'`); });
  it("requires repeat visits and exactly 60 days without a future booking", async () => {
    const result = await db.query(`SELECT customer_report_attention('inactive-repeat',NULL,'2026-08-31',NULL,2,'2026-10-30') AS yes,
      customer_report_attention('inactive-repeat',NULL,'2026-09-01',NULL,2,'2026-10-30') AS recent,
      customer_report_attention('inactive-repeat',NULL,'2026-08-31',NULL,1,'2026-10-30') AS once,
      customer_report_attention('inactive-repeat',NULL,'2026-08-31','2026-11-01Z',2,'2026-10-30') AS booked`);
    expect(result.rows[0]).toEqual({ yes:true, recent:false, once:false, booked:false });
  });
  it("requires low hours plus known activity rather than empty old accounts", async () => {
    const result = await db.query(`SELECT customer_report_attention('renewal-opportunities',1,'2026-10-01',NULL,1,'2026-10-30') AS active,
      customer_report_attention('renewal-opportunities',1,NULL,'2026-11-01Z',0,'2026-10-30') AS booked,
      customer_report_attention('renewal-opportunities',0,NULL,NULL,0,'2026-10-30') AS empty,
      customer_report_attention('renewal-opportunities',1.01,'2026-10-01',NULL,1,'2026-10-30') AS enough`);
    expect(result.rows[0]).toEqual({ active:true, booked:true, empty:false, enough:false });
  });
  it("prioritizes upcoming renewals and marks known guests only in the booking city", async () => {
    await db.exec(`INSERT INTO member_hours VALUES('${blank}','${blank}',1,0);
      UPDATE profiles SET preferred_city='Bengaluru' WHERE id='${blank}';
      INSERT INTO bookings VALUES('${blank}','${blank}',NULL,'2026-11-01Z','confirmed','immediate',NULL,'Bengaluru',NULL),
      ('00000000-0000-0000-0000-000000000006','${user}',NULL,'2026-11-02Z','confirmed','immediate',NULL,'Chennai',NULL),
      ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000000',NULL,'2026-11-03Z','confirmed','deferred',NULL,'Bengaluru',NULL),
      ('00000000-0000-0000-0000-000000000008','${user}',NULL,'2026-11-04Z','confirmed','deferred',NULL,'Bengaluru',NULL)`);
    const result = await db.query<{ value: { renewals: {id:string}[]; first_visits:string[] } }>(`SELECT customer_report(_preset=>'dashboard',_as_of=>'2026-10-30Z') AS value`);
    expect(result.rows[0].value.renewals.map(row=>row.id)).toEqual([blank,guest]);
    expect(result.rows[0].value.first_visits.sort()).toEqual([blank,'00000000-0000-0000-0000-000000000006'].sort());
    const scoped = await db.query<{ value: { first_visits:string[] } }>(`SELECT customer_report(_city=>'Bengaluru',_preset=>'dashboard',_as_of=>'2026-10-30Z') AS value`);
    expect(scoped.rows[0].value.first_visits).toEqual([blank]);
    await db.exec(`DELETE FROM bookings WHERE id IN ('${blank}','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000008'); DELETE FROM member_hours WHERE id='${blank}'; UPDATE profiles SET preferred_city=NULL WHERE id='${blank}'`);
  });
  it("excludes repeat customers with future confirmed unpaid bookings", async () => {
    await db.exec(`INSERT INTO bookings VALUES('${blank}','${user}',NULL,'2026-08-30Z','confirmed','deferred',NULL,'Bengaluru',NULL)`);
    expect((await report("_city=>'Bengaluru',_preset=>'inactive-repeat',_as_of=>'2026-10-30Z'")).total).toBe(1);
    await db.exec(`INSERT INTO bookings VALUES('00000000-0000-0000-0000-000000000006','${user}',NULL,'2026-11-01Z','confirmed','immediate',NULL,'Bengaluru',NULL)`);
    expect((await report("_city=>'Bengaluru',_preset=>'inactive-repeat',_as_of=>'2026-10-30Z'")).total).toBe(0);
    await db.exec(`DELETE FROM bookings WHERE id IN ('${blank}','00000000-0000-0000-0000-000000000006')`);
  });
  it("does not mark ambiguous ownership or the same parent visit as prior history", async () => {
    await db.exec(`UPDATE profiles SET user_id='${user}' WHERE id='${blank}';
      INSERT INTO bookings VALUES('${blank}','${user}',NULL,'2026-11-01Z','confirmed','deferred',NULL,'Bengaluru',NULL)`);
    let result = await db.query<{ value: {first_visits:string[]} }>(`SELECT customer_report(_preset=>'dashboard',_as_of=>'2026-10-30Z') AS value`);
    expect(result.rows[0].value.first_visits).toEqual([]);
    await db.exec(`UPDATE profiles SET user_id=NULL WHERE id='${blank}';
      UPDATE bookings SET user_id='${blank}',parent_booking_id='${booking}' WHERE id='${blank}';
      INSERT INTO bookings VALUES('00000000-0000-0000-0000-000000000006','${blank}','${booking}','2026-10-01Z','confirmed','deferred',NULL,'Bengaluru',NULL)`);
    result = await db.query(`SELECT customer_report(_preset=>'dashboard',_as_of=>'2026-10-30Z') AS value`);
    expect(result.rows[0].value.first_visits).toEqual([blank]);
    await db.exec(`DELETE FROM bookings WHERE id IN ('${blank}','00000000-0000-0000-0000-000000000006')`);
  });
  it("keeps dashboard attention within site-admin cities and denies non-admins", async () => {
    await db.exec(`SET request.user_id='${blank}'`);
    const result = await db.query<{ value:{cities:string[];renewals:unknown[];inactive:unknown[]} }>(`SELECT customer_report(_preset=>'dashboard',_as_of=>'2026-10-30Z') AS value`);
    expect(result.rows[0].value.cities).toEqual(['Chennai']);
    expect(result.rows[0].value.renewals).toEqual([]);
    expect(result.rows[0].value.inactive).toEqual([]);
    await expect(report("_city=>'Bengaluru',_preset=>'dashboard'")).rejects.toThrow('Location access denied');
    await db.exec(`SET request.user_id='${user}'`);
    await expect(report("_preset=>'dashboard'")).rejects.toThrow('Administrator access required');
    await db.exec(`SET request.user_id='${admin}'`);
  });
});
describe("customer report sorting", () => {
  const alpha = "00000000-0000-0000-0000-0000000000a1";
  const bravo = "00000000-0000-0000-0000-0000000000b2";
  beforeAll(async () => {
    await db.exec(`INSERT INTO profiles VALUES('${alpha}',null,'Alpha','alpha@example.test',null,5,now(),'guest','Bengaluru',false),('${bravo}',null,'bravo','bravo@example.test',null,50,now(),'guest','Bengaluru',false);
      INSERT INTO member_hours VALUES('${alpha}','${alpha}',10,0);`);
  });
  afterAll(async () => { await db.exec(`DELETE FROM member_hours WHERE user_id='${alpha}'; DELETE FROM profiles WHERE id IN ('${alpha}','${bravo}');`); });
  it("sorts names ascending by default and descending on request", async () => {
    const asc = await report("_city=>'Bengaluru',_sort=>'name',_as_of=>'2026-10-30Z'");
    expect(asc.rows.map(r => r.display_name)).toEqual(["Alpha", "bravo", "Guest"]);
    const desc = await report("_city=>'Bengaluru',_sort=>'name',_dir=>'desc',_as_of=>'2026-10-30Z'");
    expect(desc.rows.map(r => r.display_name)).toEqual(["Guest", "bravo", "Alpha"]);
  });
  it("sorts points and remaining hours numerically", async () => {
    const points = await report("_city=>'Bengaluru',_sort=>'points',_dir=>'desc',_as_of=>'2026-10-30Z'");
    expect(points.rows.map(r => r.points)).toEqual([50, 5, 0]);
    const hours = await report("_city=>'Bengaluru',_sort=>'hours',_dir=>'desc',_as_of=>'2026-10-30Z'");
    expect(hours.rows.map(r => Number(r.hours_remaining))).toEqual([10, 1, 0]);
  });
  it("sorts ascending dates least to most recent with blanks last", async () => {
    const asc = await report("_city=>'Bengaluru',_sort=>'last-visit',_as_of=>'2026-10-30Z'");
    expect(asc.rows[0].id).toBe(guest);
    expect(asc.rows.slice(1).every(r => r.last_visit === null)).toBe(true);
    const desc = await report("_city=>'Bengaluru',_sort=>'last-visit',_dir=>'desc',_as_of=>'2026-10-30Z'");
    expect(desc.rows[0].id).toBe(guest);
    expect(desc.rows.slice(1).every(r => r.last_visit === null)).toBe(true);
  });
  it("keeps the default name ordering when no sort is requested", async () => {
    const unsorted = await report("_city=>'Bengaluru',_as_of=>'2026-10-30Z'");
    expect(unsorted.rows.map(r => r.display_name)).toEqual(["Alpha", "bravo", "Guest"]);
  });
  it("rejects unknown sort columns and directions", async () => {
    await expect(report("_city=>'Bengaluru',_sort=>'email',_as_of=>'2026-10-30Z'")).rejects.toThrow("Invalid report filter");
    await expect(report("_city=>'Bengaluru',_sort=>'name',_dir=>'sideways',_as_of=>'2026-10-30Z'")).rejects.toThrow("Invalid report filter");
  });
});