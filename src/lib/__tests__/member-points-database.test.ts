// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const staff = "00000000-0000-0000-0000-0000000000a1";
const member = "00000000-0000-0000-0000-0000000000b1";
const other = "00000000-0000-0000-0000-0000000000c1";
const walkInProfile = "00000000-0000-0000-0000-0000000000d1";
const reward = "00000000-0000-0000-0000-0000000000e1";
const hiddenReward = "00000000-0000-0000-0000-0000000000e2";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
    CREATE FUNCTION public.is_admin_or_site_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = '${staff}'::uuid $$;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, user_id uuid UNIQUE, points integer DEFAULT 0, updated_at timestamptz);
    CREATE TABLE public.rewards(id uuid PRIMARY KEY, name text, points_cost integer, is_available boolean);
    CREATE TABLE public.points_transactions(id serial PRIMARY KEY, user_id uuid, type text, points integer, description text, reward_id uuid, created_by uuid);
    GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
    CREATE FUNCTION public.increment_user_points(p_user_id uuid, p_delta integer) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
    CREATE FUNCTION public.decrement_user_points_safe(p_user_id uuid, p_delta integer) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;`);
  await db.exec(readFileSync("drizzle/migrations/0018_authorized_member_points.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
}, 30000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE profiles, rewards, points_transactions;
    INSERT INTO profiles(id,user_id,points) VALUES ('${member}','${member}',100),('${other}','${other}',50),('${walkInProfile}',NULL,20);
    INSERT INTO rewards VALUES ('${reward}','Free bucket',80,true),('${hiddenReward}','Retired cap',10,false);`);
});

async function as(actor: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`SET test.actor='${actor ?? ""}'; SET ROLE authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec("RESET ROLE"); }
}
const adjust = (actor: string | null, ref: string, kind: string, points: number, rewardId: string | null = null) =>
  as(actor, "SELECT adjust_member_points($1,$2,$3,'Reason',$4) AS r", [ref, kind, points, rewardId]);
const points = async (id: string) => (await db.query<{ points: number }>("SELECT points FROM profiles WHERE id=$1", [id])).rows[0].points;
const history = async () => (await db.query("SELECT user_id,type,points,description,created_by FROM points_transactions ORDER BY id")).rows;

describe("authorized member points", () => {
  it("lets staff award 25 points and records one history entry", async () => {
    const { rows } = await adjust(staff, member, "allocation", 25);
    expect(rows[0]).toEqual({ r: { total_points: 125 } });
    expect(await history()).toEqual([{ user_id: member, type: "allocation", points: 25, description: "Reason", created_by: staff }]);
  });

  it("lets staff award points to a member registered without a sign-in", async () => {
    await adjust(staff, walkInProfile, "allocation", 5);
    expect(await points(walkInProfile)).toBe(25);
  });

  it("refuses member and signed-out awards", async () => {
    await expect(adjust(member, member, "allocation", 1000)).rejects.toThrow("Only staff can award points");
    await expect(adjust(null, member, "allocation", 1000)).rejects.toThrow("Sign in required");
    expect(await points(member)).toBe(100);
    expect(await history()).toEqual([]);
  });

  it("refuses negative or zero amounts, so a negative redemption cannot add points", async () => {
    await expect(adjust(member, member, "redemption", -500, reward)).rejects.toThrow("positive whole number");
    await expect(adjust(staff, member, "allocation", 0)).rejects.toThrow("positive whole number");
    expect(await points(member)).toBe(100);
  });

  it("lets a member redeem an available reward at its 80-point cost, with balance and history together", async () => {
    await adjust(member, member, "redemption", 80, reward);
    expect(await points(member)).toBe(20);
    expect(await history()).toEqual([{ user_id: member, type: "redemption", points: 80, description: "Redeemed: Free bucket", created_by: member }]);
  });

  it("refuses member redemptions below cost, of unavailable rewards, beyond the balance or for someone else", async () => {
    await expect(adjust(member, member, "redemption", 1, reward)).rejects.toThrow("points cost has changed");
    await expect(adjust(member, member, "redemption", 10, hiddenReward)).rejects.toThrow("not available");
    await expect(adjust(other, other, "redemption", 80, reward)).rejects.toThrow("Insufficient points");
    await expect(adjust(member, other, "redemption", 80, reward)).rejects.toThrow("only redeem your own");
    expect([await points(member), await points(other)]).toEqual([100, 50]);
    expect(await history()).toEqual([]);
  });

  it("blocks members from editing their own balance directly, but allows other profile edits", async () => {
    await expect(as(member, "UPDATE profiles SET points=99999 WHERE user_id=$1", [member])).rejects.toThrow("authorized points action");
    await as(member, "UPDATE profiles SET updated_at=now() WHERE user_id=$1", [member]);
    expect(await points(member)).toBe(100);
  });

  it("starts self-created profiles at zero points", async () => {
    const fresh = "00000000-0000-0000-0000-0000000000f1";
    await as(fresh, "INSERT INTO profiles(id,user_id,points) VALUES ($1,$1,5000)", [fresh]);
    expect(await points(fresh)).toBe(0);
  });

  it("keeps raw balance helpers away from browsers", async () => {
    const { rows } = await db.query<{ anon: boolean; member: boolean; service: boolean }>(`SELECT
      has_function_privilege('anon','public.increment_user_points(uuid,integer)','EXECUTE') anon,
      has_function_privilege('authenticated','public.decrement_user_points_safe(uuid,integer)','EXECUTE') member,
      has_function_privilege('service_role','public.increment_user_points(uuid,integer)','EXECUTE') service`);
    expect(rows[0]).toEqual({ anon: false, member: false, service: true });
    const pub = await db.query<{ ok: boolean }>("SELECT has_function_privilege('anon','public.adjust_member_points(uuid,text,integer,text,uuid)','EXECUTE') ok");
    expect(pub.rows[0].ok).toBe(false);
  });
});
