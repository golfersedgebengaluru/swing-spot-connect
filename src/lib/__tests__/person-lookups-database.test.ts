// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const admin = "00000000-0000-0000-0000-0000000000a1";
const member = "00000000-0000-0000-0000-0000000000b1";
const coach = "00000000-0000-0000-0000-0000000000c1";
let db: PGlite;

const legacyFns = [
  "promote_managed_team_member(_a uuid)",
  "link_managed_member_on_login(_a uuid, _b text)",
  "claim_legacy_league_invites(_a uuid, _b text)",
  "claim_legacy_league_team_by_token(_a uuid, _b uuid)",
  "claim_legacy_league_invite_by_token(_a uuid, _b uuid)",
  "admin_list_legacy_team_invites(_a uuid, _b uuid)",
  "admin_revoke_legacy_invite(_a uuid, _b uuid)",
  "admin_rotate_legacy_invite(_a uuid, _b uuid)",
  "admin_create_managed_team(_a uuid, _b uuid, _c uuid, _d uuid, _e text, _f jsonb)",
  "admin_add_managed_member(_a uuid, _b uuid, _c text, _d text, _e text)",
  "admin_update_managed_member(_a uuid, _b uuid, _c text, _d text, _e text)",
  "admin_delete_managed_member(_a uuid, _b uuid)",
  "admin_update_team_registration(_a uuid, _b uuid, _c text, _d uuid, _e uuid, _f integer)",
  "admin_delete_team_registration(_a uuid, _b uuid)",
];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('test.jwt_role',true),'') $$;
    GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;
    CREATE TYPE public.app_role AS ENUM ('admin','site_admin','user','coach');
    CREATE TABLE public.user_roles(user_id uuid, role app_role);
    CREATE TABLE public.site_admin_cities(user_id uuid, city text);
    CREATE TABLE public.league_roles(user_id uuid, tenant_id uuid);
    CREATE TABLE public.profiles(user_id uuid, date_of_birth date);
    CREATE FUNCTION public.age_years(d date) RETURNS integer LANGUAGE sql AS $$ SELECT extract(year FROM age(d))::int $$;
    CREATE TABLE public.policy_versions(slug text, version text, published_at timestamptz);
    CREATE TABLE public.consent_log(user_id uuid, consent_type text, granted boolean, created_at timestamptz);
    CREATE TABLE public.advance_transactions(customer_id uuid, vendor_id uuid, transaction_type text, amount numeric);
    CREATE FUNCTION public.get_advance_balance(p_customer_id uuid) RETURNS numeric LANGUAGE sql SECURITY DEFINER AS $$ SELECT 0::numeric $$;
    CREATE FUNCTION public.get_vendor_advance_balance(p_vendor_id uuid) RETURNS numeric LANGUAGE sql SECURITY DEFINER AS $$ SELECT 0::numeric $$;
    CREATE FUNCTION public.is_admin_or_site_admin(uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT $1 = '${admin}'::uuid $$;
    ${legacyFns.map((f) => `CREATE FUNCTION public.${f} RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT true $$;`).join("\n")}
    CREATE TABLE public.bookings(id serial PRIMARY KEY, user_id uuid, status text);
    ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can insert own bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "Users can update own bookings" ON public.bookings FOR UPDATE TO authenticated USING (auth.uid() = user_id);
    CREATE POLICY "Users can view own bookings" ON public.bookings FOR SELECT TO authenticated USING (auth.uid() = user_id);
    CREATE TABLE public.rewards(name text, is_available boolean);
    ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Rewards are viewable by everyone" ON public.rewards FOR SELECT USING (true);
    CREATE TABLE public.auto_gift_rules(name text);
    ALTER TABLE public.auto_gift_rules ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Auto gift rules viewable by authenticated" ON public.auto_gift_rules FOR SELECT TO authenticated USING (true);
    CREATE TABLE public.cookie_consents(user_id uuid, session_id text, necessary boolean, analytics boolean, marketing boolean, policy_version text, ip_address text, user_agent text);
    ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Anyone can record a cookie consent" ON public.cookie_consents FOR INSERT TO anon, authenticated WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE ON public.bookings, public.cookie_consents TO authenticated;
    GRANT USAGE ON SEQUENCE public.bookings_id_seq TO authenticated;
    GRANT SELECT ON public.rewards, public.auto_gift_rules TO anon, authenticated;
    GRANT INSERT ON public.cookie_consents TO anon;
    INSERT INTO user_roles VALUES ('${admin}','admin'),('${coach}','coach'),('${member}','user');
    INSERT INTO site_admin_cities VALUES ('${admin}','Chennai');
    INSERT INTO profiles VALUES ('${member}','2015-01-01');
    INSERT INTO rewards VALUES ('Free drink', true), ('Retired cap', false);
    INSERT INTO auto_gift_rules VALUES ('Birthday');
    INSERT INTO bookings(user_id,status) VALUES ('${member}','cancelled');`);
  await db.exec(readFileSync("drizzle/migrations/0024_restrict_person_lookups_and_team_operations.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
}, 30000);
afterAll(async () => db?.close());

async function as(role: "anon" | "authenticated" | "service_role", actor: string | null, sql: string) {
  await db.exec(`SET test.actor='${actor ?? ""}'; SET test.jwt_role='${role}'; SET ROLE ${role};`);
  try { return await db.query<Record<string, unknown>>(sql); } finally { await db.exec("RESET ROLE"); }
}
const one = async (role: "anon" | "authenticated" | "service_role", actor: string | null, sql: string) =>
  Object.values((await as(role, actor, sql)).rows[0])[0];

describe("person lookups", () => {
  it("answers for the signed-in person themself", async () => {
    expect(await one("authenticated", coach, `SELECT has_role('${coach}','coach')`)).toBe(true);
    expect(await one("authenticated", coach, `SELECT is_coach('${coach}')`)).toBe(true);
    expect(await one("authenticated", member, `SELECT is_minor('${member}')`)).toBe(true);
  });

  it("says no when members or visitors probe someone else", async () => {
    expect(await one("authenticated", member, `SELECT has_role('${admin}','admin')`)).toBe(false);
    expect(await one("anon", null, `SELECT has_role('${admin}','admin')`)).toBe(false);
    expect(await one("authenticated", member, `SELECT is_coach('${coach}')`)).toBe(false);
    expect(await one("authenticated", member, `SELECT site_admin_has_city('${admin}','Chennai')`)).toBe(false);
    expect(await one("authenticated", coach, `SELECT is_minor('${member}')`)).toBe(false);
    await expect(as("authenticated", member, `SELECT needs_reconsent('${admin}')`)).rejects.toThrow("Not authorized");
  });

  it("still answers for staff and the server", async () => {
    expect(await one("authenticated", admin, `SELECT is_coach('${coach}')`)).toBe(true);
    expect(await one("service_role", null, `SELECT has_role('${admin}','admin')`)).toBe(true);
    expect(await one("authenticated", admin, `SELECT site_admin_has_city('${admin}','Chennai')`)).toBe(true);
  });
});

describe("league team operations", () => {
  it("can only be run by the league service", async () => {
    for (const f of legacyFns) {
      const name = f.split("(")[0];
      const args = (f.match(/\((.*)\)/)?.[1] ?? "").split(",").map((p) => `NULL::${p.trim().split(" ")[1]}`).join(",");
      await expect(as("authenticated", admin, `SELECT ${name}(${args})`)).rejects.toThrow(/permission denied/);
      expect(await one("service_role", null, `SELECT ${name}(${args})`)).toBe(true);
    }
  });
});

describe("table access", () => {
  it("stops members creating or reviving bookings directly", async () => {
    await expect(as("authenticated", member, `INSERT INTO bookings(user_id,status) VALUES ('${member}','confirmed')`)).rejects.toThrow(/row-level security/);
    await as("authenticated", member, `UPDATE bookings SET status='confirmed' WHERE user_id='${member}'`);
    expect((await db.query("SELECT status FROM bookings")).rows).toEqual([{ status: "cancelled" }]);
  });

  it("shows visitors only rewards on offer and hides gift rules from members", async () => {
    expect((await as("anon", null, "SELECT name FROM rewards")).rows).toEqual([{ name: "Free drink" }]);
    expect((await as("authenticated", admin, "SELECT count(*)::int n FROM rewards")).rows[0].n).toBe(2);
    expect((await as("authenticated", member, "SELECT * FROM auto_gift_rules")).rows).toEqual([]);
  });

  it("lets visitors record only their own cookie choice", async () => {
    await as("anon", null, "INSERT INTO cookie_consents(user_id,session_id,necessary,analytics,marketing,policy_version) VALUES (NULL,'s1',true,false,false,'1.0')");
    await as("authenticated", member, `INSERT INTO cookie_consents(user_id,session_id,necessary,analytics,marketing,policy_version) VALUES ('${member}','s2',true,true,false,'1.0')`);
    await expect(as("anon", null, `INSERT INTO cookie_consents(user_id,necessary,analytics,marketing) VALUES ('${member}',true,false,false)`)).rejects.toThrow(/row-level security/);
    await expect(as("anon", null, "INSERT INTO cookie_consents(necessary,analytics,marketing,ip_address) VALUES (true,false,false,'1.2.3.4')")).rejects.toThrow(/row-level security/);
  });
});
