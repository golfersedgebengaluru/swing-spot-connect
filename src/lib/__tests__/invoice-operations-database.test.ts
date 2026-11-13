// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
const admin="00000000-0000-0000-0000-000000000001", staff="00000000-0000-0000-0000-000000000002", member="00000000-0000-0000-0000-000000000003", id="00000000-0000-0000-0000-000000000004";
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
    CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT ($1='${admin}' AND $2='admin') OR ($1='${staff}' AND $2='site_admin') $$;
    CREATE FUNCTION is_admin_or_site_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 IN ('${admin}','${staff}') $$;
    CREATE FUNCTION has_city_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $2='Bengaluru' $$;
    CREATE FUNCTION cancel_booking_with_clawback(uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION injected_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected failure'; END $$;`);
  await db.exec(readFileSync("src/lib/__tests__/invoice-operations-fixture.sql","utf8"));
  await db.exec(`CREATE TABLE test_numbers(n int); INSERT INTO test_numbers VALUES(41);
    CREATE FUNCTION get_next_invoice_number(text,uuid,text,int,text) RETURNS text LANGUAGE plpgsql AS $$ DECLARE n int; BEGIN UPDATE test_numbers SET n=test_numbers.n+1 RETURNING test_numbers.n INTO n; RETURN $3||'/'||n; END $$;
    CREATE FUNCTION record_revenue(p_source_ref text,p_transaction_type text,p_amount numeric,p_description text,p_city text DEFAULT NULL,p_currency text DEFAULT NULL,p_user_id uuid DEFAULT NULL,p_booking_id uuid DEFAULT NULL,p_product_id uuid DEFAULT NULL,p_hours_transaction_id uuid DEFAULT NULL,p_gateway_name text DEFAULT NULL,p_revenue_date date DEFAULT NULL,p_guest_name text DEFAULT NULL,p_guest_email text DEFAULT NULL,p_metadata jsonb DEFAULT '{}') RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE r uuid; BEGIN IF p_amount=0 THEN RETURN NULL; END IF; INSERT INTO revenue_transactions(source_ref,transaction_type,amount,description,city,user_id,gateway_name,revenue_date,metadata) VALUES(p_source_ref,p_transaction_type,p_amount,p_description,p_city,p_user_id,p_gateway_name,p_revenue_date,p_metadata) RETURNING id INTO r; RETURN r; END $$;`);
  for(const file of ["0014_restrict_legacy_cancellation_and_restore_staff_assignment.sql","0015_atomic_manual_invoice_operations.sql","0016_correct_atomic_invoice_recycling.sql","0023_void_offline_revenue_on_invoice_delete.sql"]) await db.exec(readFileSync(`drizzle/migrations/${file}`,"utf8"));
},30000);
afterAll(async()=>db?.close());
beforeEach(async()=>{
  await db.exec(`TRUNCATE invoices,invoice_line_items,revenue_transactions,bookings,gst_profiles,financial_years,profiles,recycled_invoice_numbers,bays,user_roles,site_admin_cities; UPDATE test_numbers SET n=41; SET test.actor='${admin}';
    INSERT INTO gst_profiles(city,legal_name,gstin) VALUES('Bengaluru','Centre','GST');
    INSERT INTO financial_years(id,label,start_date,end_date,is_active) VALUES('${admin}','2026-27','2026-04-01','2027-03-31',true);
    INSERT INTO bays(id,city,name) VALUES('${admin}','Bengaluru','Bay 1');`);
});
async function create(total=1250,booking=true){
  const invoice={city:"Bengaluru",customer_name:"Member",customer_user_id:member,invoice_date:"2026-08-02",invoice_type:"invoice",invoice_category:booking?"booking":"purchase",subtotal:total,cgst_total:0,sgst_total:0,igst_total:0,total,amount_paid:total,payment_status:"paid",discount_value:0,discount_amount:0};
  const lines=[{item_name:"Session",item_type:"service",quantity:1,unit_price:total,gst_rate:0,cgst_amount:0,sgst_amount:0,igst_amount:0,line_total:total,sort_order:0}];
  const bk=booking?{user_id:member,bay_id:admin,start_time:"2026-11-08T06:30:00Z",end_time:"2026-11-08T08:30:00Z",duration_minutes:120}:null;
  return db.query("SELECT create_manual_invoice_atomic($1,$2,$3,$4,false) result",[id,JSON.stringify(invoice),JSON.stringify(lines),bk?JSON.stringify(bk):null]);
}
async function remove(){return db.query("SELECT delete_invoice_atomic($1)",[id]);}
async function state(){return (await db.query(`SELECT (SELECT count(*)::int FROM invoices) invoices,(SELECT count(*)::int FROM invoice_line_items) lines,(SELECT count(*)::int FROM revenue_transactions WHERE status='confirmed') sales,(SELECT count(*)::int FROM bookings WHERE status='confirmed') bookings,(SELECT count(*)::int FROM recycled_invoice_numbers) recycled,(SELECT n FROM test_numbers) sequence`)).rows[0];}
describe("transactional invoice operations",()=>{
  it("commits one ₹1,250 invoice, ledger entry and attributed booking, retaining August 2 business date",async()=>{
    await create(); expect(await state()).toEqual({invoices:1,lines:1,sales:1,bookings:1,recycled:0,sequence:42});
    expect((await db.query("SELECT amount,revenue_date::text FROM revenue_transactions")).rows[0]).toEqual({amount:"1250",revenue_date:"2026-08-02"});
    await remove(); expect(await state()).toEqual({invoices:0,lines:0,sales:0,bookings:0,recycled:1,sequence:42});
  });
  it("replays creation and concurrent deletion without duplicate payments or recycling",async()=>{
    await Promise.all([create(),create()]); expect(await state()).toMatchObject({invoices:1,sales:1,sequence:42});
    await Promise.all([remove(),remove()]); expect(await state()).toMatchObject({invoices:0,recycled:1});
  });
  for(const table of ["invoices","invoice_line_items","bookings"]){
    it(`rolls back creation, payment and numbering if ${table} insertion fails`,async()=>{
      const before=await state(); await db.exec(`CREATE TRIGGER fail BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION injected_failure()`);
      try{await expect(create()).rejects.toThrow("Injected failure");expect(await state()).toEqual(before);}finally{await db.exec(`DROP TRIGGER fail ON ${table}`);}
      await create();expect(await state()).toMatchObject({invoices:1,sales:1});
    });
  }
  for(const [table,event] of [["invoices","DELETE"],["invoice_line_items","DELETE"],["revenue_transactions","UPDATE"],["bookings","UPDATE"],["recycled_invoice_numbers","INSERT"]]){
    it(`rolls back the entire deletion if ${table} ${event} fails and safely retries`,async()=>{
      await create();const before=await state();await db.exec(`CREATE TRIGGER fail BEFORE ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION injected_failure()`);
      try{await expect(remove()).rejects.toThrow("Injected failure");expect(await state()).toEqual(before);}finally{await db.exec(`DROP TRIGGER fail ON ${table}`);}
      await remove();expect(await state()).toMatchObject({invoices:0,sales:0,bookings:0,recycled:1});
    });
  }
  it("cancels its zero-total booking without requiring a revenue link",async()=>{await create(0);await remove();expect(await state()).toMatchObject({invoices:0,sales:0,bookings:0});});
  it("prefers the city financial year over global and removes GST identity for an unregistered city",async()=>{
    await db.exec(`INSERT INTO financial_years(id,label,start_date,end_date,is_active,city) VALUES('${staff}','City FY','2026-04-01','2027-03-31',true,'Bengaluru'); UPDATE gst_profiles SET is_gst_registered=false;`);
    await create();
    expect((await db.query("SELECT financial_year_id,business_gstin FROM invoices")).rows[0]).toEqual({financial_year_id:staff,business_gstin:""});
  });
  it("uses global financial year when no city year exists",async()=>{
    await create();expect((await db.query("SELECT financial_year_id FROM invoices")).rows[0]).toEqual({financial_year_id:admin});
  });
  it("refuses to delete an invoice for an online gateway payment and leaves the payment and booking untouched",async()=>{
    await create();await db.exec(`UPDATE revenue_transactions SET metadata='{}',gateway_name='razorpay',gateway_order_ref='order_1'; UPDATE bookings SET manual_invoice_origin_id=NULL,note='Online booking';`);
    const before=await state();await expect(remove()).rejects.toThrow("credit note");expect(await state()).toEqual(before);
  });
  it("deleting an automatic invoice for an offline ₹1,800 walk-in also cancels its payment entry but keeps the booking",async()=>{
    await create(1800);await db.exec(`UPDATE revenue_transactions SET metadata='{}',gateway_name='In-Store Payment'; UPDATE bookings SET manual_invoice_origin_id=NULL,note='Walk-in';`);
    await remove();expect(await state()).toMatchObject({invoices:0,sales:0,bookings:1});
    expect((await db.query("SELECT status,metadata->>'voided_reason' reason FROM revenue_transactions")).rows[0]).toEqual({status:"failed",reason:"invoice_deleted"});
  });
  it("deleting a credit note does not cancel the refund entry it points to",async()=>{
    await create();await db.exec(`UPDATE revenue_transactions SET metadata='{}',transaction_type='refund'; UPDATE invoices SET invoice_type='credit_note'; UPDATE bookings SET manual_invoice_origin_id=NULL,note='Online booking';`);
    await remove();expect(await state()).toMatchObject({invoices:0,sales:1});
  });
  it("ordinary users and staff outside the invoice city cannot change documents",async()=>{
    await create();const before=await state();await db.exec(`SET test.actor='${member}'`);await expect(remove()).rejects.toThrow("Administrator");
    await db.exec(`SET test.actor='${staff}'; UPDATE invoices SET city='Chennai'`);await expect(remove()).rejects.toThrow("city access");
    expect(await state()).toEqual(before);await expect(create()).rejects.toThrow("city mismatch");
  });
  it("permits authorized city staff and denies anonymous internal operations",async()=>{
    await db.exec(`SET test.actor='${staff}'`);await create();await remove();
    expect((await db.query(`SELECT has_function_privilege('anon','cancel_booking_with_clawback(uuid,uuid)','execute') cancel,has_function_privilege('anon','grant_site_admin_with_cities(uuid,text[])','execute') grant_role`)).rows[0]).toEqual({cancel:false,grant_role:false});
  });
  it("staff assignment validates cities, deduplicates and rolls back role changes on assignment failure",async()=>{
    await db.query("SELECT grant_site_admin_with_cities($1,$2)",[member,["Bengaluru","Bengaluru"]]);
    expect((await db.query("SELECT count(*)::int n FROM site_admin_cities")).rows[0]).toEqual({n:1});
    await expect(db.query("SELECT grant_site_admin_with_cities($1,$2)",[staff,["Unknown"]])).rejects.toThrow("must exist");
    await db.exec("CREATE TRIGGER fail BEFORE INSERT ON site_admin_cities FOR EACH ROW EXECUTE FUNCTION injected_failure()");
    try{await expect(db.query("SELECT grant_site_admin_with_cities($1,$2)",[staff,["Bengaluru"]])).rejects.toThrow("Injected failure");expect((await db.query("SELECT count(*)::int n FROM user_roles WHERE user_id=$1",[staff])).rows[0]).toEqual({n:0});}finally{await db.exec("DROP TRIGGER fail ON site_admin_cities");}
  });
});