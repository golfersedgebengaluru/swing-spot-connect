// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const adult = "00000000-0000-0000-0000-0000000000a1";
const minor = "00000000-0000-0000-0000-0000000000b1";
const staff = "00000000-0000-0000-0000-0000000000c1";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('test.jwt_role',true),'') $$;
    CREATE FUNCTION extensions.digest(text,text) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(md5($1),'hex') $$;
    CREATE FUNCTION extensions.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(md5(random()::text),'hex') $$;
    CREATE TYPE public.app_role AS ENUM ('admin','site_admin','user','coach');
    CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, email text, display_name text, date_of_birth date,
      parent_email text, parent_consent_status text, parent_consent_token text, parent_consent_at timestamptz, updated_at timestamptz DEFAULT now());
    CREATE TABLE public.policy_versions(id uuid DEFAULT gen_random_uuid(), slug text, version text, published_at timestamptz);
    CREATE TABLE public.consent_log(id uuid DEFAULT gen_random_uuid(), user_id uuid, email text, consent_type text,
      granted boolean, policy_version text, user_agent text, created_at timestamptz DEFAULT now());
    CREATE TABLE public.bookings(user_id uuid);
    CREATE TABLE public.coaching_sessions(student_user_id uuid);
    CREATE TABLE public.orders(user_id uuid);
    CREATE TABLE public.community_posts(user_id uuid, content text);
    CREATE TABLE public.league_players(user_id uuid);
    GRANT INSERT ON public.bookings, public.coaching_sessions, public.orders, public.community_posts, public.league_players TO authenticated, service_role;
    GRANT SELECT ON public.bookings, public.coaching_sessions, public.orders, public.community_posts, public.league_players TO service_role;
    GRANT INSERT ON public.policy_versions TO service_role;
    CREATE FUNCTION public.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = '${staff}' AND $2 IN ('admin','site_admin','coach') $$;
    CREATE FUNCTION public.is_admin_or_site_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = '${staff}' $$;
    CREATE FUNCTION public.caller_may_inspect_other_users() RETURNS boolean LANGUAGE sql AS $$ SELECT auth.uid() = '${staff}' $$;
    INSERT INTO public.profiles(user_id,email,display_name) VALUES
      ('${adult}','adult@example.com','Adult'),('${minor}','minor@example.com','Minor'),('${staff}','staff@example.com','Staff');
    INSERT INTO public.policy_versions(slug,version,published_at) VALUES ('terms','1.0','2026-05-22'),('privacy','2.1','2026-05-23');
    GRANT SELECT ON public.consent_log, public.policy_versions TO authenticated, service_role;
    GRANT DELETE, INSERT ON public.consent_log TO service_role;
    GRANT SELECT, UPDATE ON public.profiles TO authenticated, service_role;`);
  await db.exec(readFileSync("drizzle/migrations/0033_simple_age_declaration_consent.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
  await db.exec(readFileSync("drizzle/migrations/0034_enforce_age_consent_member_writes.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
  await db.exec(readFileSync("drizzle/migrations/0035_allow_reaccept_republished_policies.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
}, 30000);

afterAll(async () => db?.close());

async function as(role: "anon" | "authenticated" | "service_role", actor: string | null, sql: string) {
  await db.exec(`SET test.actor='${actor ?? ""}'; SET test.jwt_role='${role}'; SET ROLE ${role};`);
  try { return await db.query<Record<string, unknown>>(sql); } finally { await db.exec("RESET ROLE"); }
}
const one = async (role: "anon" | "authenticated" | "service_role", actor: string | null, sql: string) =>
  Object.values((await as(role, actor, sql)).rows[0])[0];

describe("age declarations", () => {
  it("treats an explicit adult answer with current policies as complete", async () => {
    await as("authenticated", adult, `SELECT submit_age_declaration(true,true,false,'test')`);
    expect(await one("authenticated", adult, `SELECT member_age_consent_allows_writes('${adult}')`)).toBe(true);
    expect((await db.query(`SELECT consent_type,policy_version FROM consent_log WHERE user_id='${adult}' AND consent_type IN ('tos','privacy') ORDER BY consent_type`)).rows).toEqual([
      { consent_type: "privacy", policy_version: "2.1" }, { consent_type: "tos", policy_version: "1.0" },
    ]);
    await as("authenticated", adult, `SELECT submit_age_declaration(true,true,false,'test')`);
    expect(await one("service_role", null, `SELECT count(*)::int FROM consent_log WHERE user_id='${adult}' AND consent_type='tos'`)).toBe(1);
  });

  it("requires a declaration and does not let members inspect or act as others", async () => {
    expect(await one("authenticated", minor, `SELECT member_age_consent_allows_writes('${minor}')`)).toBe(false);
    expect(await one("authenticated", minor, `SELECT member_age_consent_allows_writes('${adult}')`)).toBe(false);
    expect(await one("authenticated", staff, `SELECT member_age_consent_allows_writes('${staff}')`)).toBe(true);
  });

  it("requires fresh acceptance when a policy is republished, even with the same version label", async () => {
    await as("service_role", null, `INSERT INTO policy_versions(slug,version,published_at) VALUES ('terms','1.0',now())`);
    expect(await one("authenticated", adult, `SELECT member_age_consent_allows_writes('${adult}')`)).toBe(false);
    await as("authenticated", adult, `SELECT submit_age_declaration(true,true,false,'test')`);
    expect(await one("authenticated", adult, `SELECT member_age_consent_allows_writes('${adult}')`)).toBe(true);
  });

  it("keeps a declared minor in the parent flow", async () => {
    await as("authenticated", minor, `SELECT submit_age_declaration(false,true,false,'test')`);
    await expect(as("authenticated", minor, `SELECT submit_age_declaration(true,true,false,'test')`)).rejects.toThrow("cannot be changed");
    expect(await one("authenticated", minor, `SELECT member_age_consent_allows_writes('${minor}')`)).toBe(false);
  });
});

describe("member write enforcement", () => {
  it("blocks an incomplete member but allows an eligible adult", async () => {
    await expect(as("authenticated", minor, `INSERT INTO community_posts(user_id,content) VALUES ('${minor}','blocked')`)).rejects.toThrow("age and policy check");
    await as("authenticated", adult, `INSERT INTO community_posts(user_id,content) VALUES ('${adult}','allowed')`);
    expect(await one("service_role", null, `SELECT count(*)::int FROM community_posts`)).toBe(1);
  });

  it("does not block staff creating a record for an existing customer", async () => {
    await as("authenticated", staff, `INSERT INTO bookings(user_id) VALUES ('${minor}')`);
    expect(await one("service_role", null, `SELECT count(*)::int FROM bookings WHERE user_id='${minor}'`)).toBe(1);
  });
});

describe("parent requests", () => {
  beforeEach(async () => {
    await as("service_role", null, `DELETE FROM member_age_consents WHERE user_id='${minor}'`);
    await as("service_role", null, `DELETE FROM consent_log WHERE user_id='${minor}' AND consent_type='parental_consent'`);
    await as("service_role", null, `INSERT INTO member_age_consents(user_id,state,declared_adult,terms_version,privacy_version)
      VALUES ('${minor}','parent_required',false,'1.0','2.1')`);
  });

  it("uses a 48-hour single-use approval and records its request reference", async () => {
    const token = await one("authenticated", minor, `SELECT create_parental_consent_request('Parent@Example.com')->>'token'`) as string;
    expect(await one("service_role", null, `SELECT parent_expires_at = parent_requested_at + interval '48 hours' FROM member_age_consents WHERE user_id='${minor}'`)).toBe(true);
    expect(await one("anon", null, `SELECT count(*)::int FROM lookup_age_consent_request('${token}')`)).toBe(1);
    expect(await one("anon", null, `SELECT decide_age_consent_request('${token}',true)`)).toBe(true);
    expect(await one("anon", null, `SELECT decide_age_consent_request('${token}',true)`)).toBe(false);
    expect(await one("service_role", null, `SELECT count(*)::int FROM consent_log WHERE user_id='${minor}' AND consent_type='parental_consent' AND granted=true AND request_id IS NOT NULL`)).toBe(1);
    expect(await one("authenticated", minor, `SELECT member_age_consent_allows_writes('${minor}')`)).toBe(true);
  });

  it("enforces a 60-second resend cooldown and invalidates older links on resend", async () => {
    await as("authenticated", minor, `SELECT submit_age_declaration(false,true,false,'test')`);
    const first = await one("authenticated", minor, `SELECT create_parental_consent_request('parent@example.com')->>'request_id'`) as string;
    await as("service_role", null, `SELECT mark_parental_consent_email('${first}',true)`);
    await expect(as("authenticated", minor, `SELECT create_parental_consent_request('parent@example.com')`)).rejects.toThrow("60 seconds");
    await as("service_role", null, `UPDATE member_age_consents SET parent_last_sent_at=now()-interval '61 seconds' WHERE user_id='${minor}'`);
    const secondToken = await one("authenticated", minor, `SELECT create_parental_consent_request('parent@example.com')->>'token'`) as string;
    expect(await one("anon", null, `SELECT count(*)::int FROM lookup_age_consent_request('${secondToken}')`)).toBe(1);
    expect(await one("service_role", null, `SELECT parent_token_hash IS NOT NULL FROM member_age_consents WHERE user_id='${minor}'`)).toBe(true);
  });

  it("keeps a failed-delivery request recoverable without starting the cooldown", async () => {
    await as("authenticated", minor, `SELECT submit_age_declaration(false,true,false,'test')`);
    const request = await one("authenticated", minor, `SELECT create_parental_consent_request('parent@example.com')->>'request_id'`) as string;
    await as("service_role", null, `SELECT mark_parental_consent_email('${request}',false)`);
    expect(await one("service_role", null, `SELECT email_delivery_status FROM member_age_consents WHERE user_id='${minor}'`)).toBe("failed");
    expect(await one("authenticated", minor, `SELECT create_parental_consent_request('parent@example.com')->>'request_id' IS NOT NULL`)).toBe(true);
  });

  it("rejects expired links", async () => {
    const token = await one("authenticated", minor, `SELECT create_parental_consent_request('parent@example.com')->>'token'`) as string;
    await as("service_role", null, `UPDATE member_age_consents SET parent_expires_at=now()-interval '1 second' WHERE user_id='${minor}'`);
    expect(await one("anon", null, `SELECT count(*)::int FROM lookup_age_consent_request('${token}')`)).toBe(0);
    expect(await one("anon", null, `SELECT decide_age_consent_request('${token}',true)`)).toBe(false);
  });
});
