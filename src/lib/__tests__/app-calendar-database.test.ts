// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const bay1 = "00000000-0000-0000-0000-000000000001";
const bay2 = "00000000-0000-0000-0000-000000000002";
const bunker = "00000000-0000-0000-0000-000000000003";
const otherCityBay = "00000000-0000-0000-0000-000000000004";
const staff = "00000000-0000-0000-0000-0000000000a1";
const member = "00000000-0000-0000-0000-0000000000b1";
const START = "2026-12-01T13:30:00Z";
const END = "2026-12-01T14:30:00Z";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
    CREATE FUNCTION public.has_city_access(uuid, text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = '${staff}'::uuid AND $2 = 'Gurugram' $$;
    CREATE TABLE public.bays(id uuid PRIMARY KEY, city text, name text, is_active boolean DEFAULT true, sort_order int DEFAULT 0);
    CREATE TABLE public.bay_pricing(id serial PRIMARY KEY, city text, day_type text, session_type text, price_per_hour numeric);
    CREATE TABLE public.bay_config(id serial PRIMARY KEY, city text UNIQUE);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, user_id uuid, display_name text);
    CREATE TABLE public.bookings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, city text, bay_id uuid,
      start_time timestamptz, end_time timestamptz, status text DEFAULT 'confirmed', parent_booking_id uuid, note text,
      session_type text DEFAULT 'practice', calendar_event_id text);
    CREATE TABLE public.league_bay_blocks(id serial PRIMARY KEY, bay_id uuid, blocked_from timestamptz, blocked_to timestamptz);
    GRANT SELECT (id, city) ON public.bays TO authenticated;`);
  await db.exec(readFileSync("drizzle/migrations/0019_app_calendar_record_of_truth.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
  await db.exec(`INSERT INTO bays(id, city, name, sort_order, bay_type) VALUES
    ('${bay1}','Gurugram','Bay #1',1,'standard'),('${bay2}','Gurugram','Bay #2',2,'standard'),
    ('${bunker}','Gurugram','Bunker Bay',3,'bunker'),('${otherCityBay}','Chennai','Bay #1',1,'standard');`);
}, 30000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE bookings, bay_holds, bay_blockouts, league_bay_blocks;`);
});

const reserve = async (opts: { type?: string | null; preferred?: string; hold?: number | null; exclude?: string | null; start?: string; end?: string } = {}) => {
  const res = await db.query<{ bay_id: string; hold_id: string | null }>(
    "SELECT * FROM reserve_bay_slot('Gurugram', $1, $2, $3, $4, $5, $6)",
    [opts.type === undefined ? "standard" : opts.type, opts.preferred ?? bay1, opts.start ?? START, opts.end ?? END, opts.hold === undefined ? 10 : opts.hold, opts.exclude ?? null],
  );
  return res.rows[0] ?? null;
};
const book = (bay: string, start = START, end = END, extra = "") =>
  db.exec(`INSERT INTO bookings(city, bay_id, start_time, end_time${extra ? ", status" : ""}) VALUES ('Gurugram','${bay}','${start}','${end}'${extra ? `,'${extra}'` : ""})`);

describe("reserve_bay_slot", () => {
  it("holds the preferred bay when it is free", async () => {
    const r = await reserve();
    expect(r?.bay_id).toBe(bay1);
    expect(r?.hold_id).toBeTruthy();
  });

  it("moves a customer to another free bay of the same type", async () => {
    await book(bay1);
    expect((await reserve())?.bay_id).toBe(bay2);
  });

  it("never moves a Standard booking onto Bunker Bay", async () => {
    await book(bay1);
    await book(bay2);
    expect(await reserve()).toBeNull();
  });

  it("keeps staff on the exact bay they chose (no type)", async () => {
    await book(bay1);
    expect(await reserve({ type: null })).toBeNull();
  });

  it("treats a live payment hold as busy, so a second checkout gets the other bay", async () => {
    expect((await reserve())?.bay_id).toBe(bay1);
    expect((await reserve())?.bay_id).toBe(bay2);
    expect(await reserve()).toBeNull();
  });

  it("frees the slot once the hold expires or is released", async () => {
    const first = await reserve();
    await db.exec(`UPDATE bay_holds SET expires_at = now() - interval '1 second' WHERE id = '${first!.hold_id}'`);
    expect((await reserve())?.bay_id).toBe(bay1);
  });

  it("lets the paying customer turn their own hold into the booking", async () => {
    await book(bay2);
    const hold = await reserve();
    expect(hold?.bay_id).toBe(bay1);
    const finalize = await reserve({ exclude: hold!.hold_id, hold: 2 });
    expect(finalize?.bay_id).toBe(bay1);
    const old = await db.query<{ released_at: string | null }>(`SELECT released_at FROM bay_holds WHERE id = '${hold!.hold_id}'`);
    expect(old.rows[0].released_at).not.toBeNull();
  });

  it("blocks every bay for a city-wide block-out and one bay for a bay block-out", async () => {
    await db.exec(`INSERT INTO bay_blockouts(city, bay_id, start_time, end_time) VALUES ('Gurugram','${bay1}','${START}','${END}')`);
    expect((await reserve())?.bay_id).toBe(bay2);
    await db.exec(`INSERT INTO bay_blockouts(city, bay_id, start_time, end_time) VALUES ('Gurugram',NULL,'${START}','${END}')`);
    expect(await reserve({ type: "bunker", preferred: bunker })).toBeNull();
  });

  it("counts league blocks and ignores cancelled bookings and back-to-back times", async () => {
    await db.exec(`INSERT INTO league_bay_blocks(bay_id, blocked_from, blocked_to) VALUES ('${bay1}','${START}','${END}')`);
    await book(bay2, START, END, "cancelled");
    expect((await reserve({ hold: null }))?.bay_id).toBe(bay2);
    await book(bay1, END, "2026-12-01T15:30:00Z");
    expect((await reserve({ type: null, preferred: bay2 }))?.bay_id).toBe(bay2);
  });

  it("is service-only", async () => {
    await db.exec("SET ROLE authenticated");
    await expect(reserve()).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE");
  });
});

describe("bay_day_schedule", () => {
  it("shows bookings, holds and block-outs only to staff with city access", async () => {
    await book(bay1);
    await reserve({ preferred: bay2, type: null });
    await db.exec(`INSERT INTO bay_blockouts(city, bay_id, start_time, end_time, reason) VALUES ('Gurugram',NULL,'${START}','${END}','Maintenance')`);
    const call = async (actor: string) => {
      await db.exec(`SET test.actor='${actor}'; SET ROLE authenticated;`);
      try {
        return await db.query<{ kind: string; on_google: boolean }>("SELECT kind, on_google FROM bay_day_schedule('Gurugram', '2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z') ORDER BY kind");
      } finally { await db.exec("RESET ROLE"); }
    };
    const rows = (await call(staff)).rows;
    expect(rows.map((r) => r.kind)).toEqual(["blockout", "booking", "hold"]);
    expect(rows.find((r) => r.kind === "booking")?.on_google).toBe(false);
    await expect(call(member)).rejects.toThrow(/Not authorized/);
  });
});

describe("bay_blockouts access", () => {
  it("lets staff add block-outs only for their own city and as themselves", async () => {
    const insert = async (actor: string, city: string, createdBy: string, bay: string | null) => {
      await db.exec(`SET test.actor='${actor}'; SET ROLE authenticated;`);
      try {
        await db.query("INSERT INTO bay_blockouts(city, bay_id, start_time, end_time, created_by) VALUES ($1,$2,$3,$4,$5)", [city, bay, START, END, createdBy]);
      } finally { await db.exec("RESET ROLE"); }
    };
    await expect(insert(staff, "Gurugram", staff, bay1)).resolves.toBeUndefined();
    await expect(insert(member, "Gurugram", member, null)).rejects.toThrow(/row-level security/);
    await expect(insert(staff, "Gurugram", member, null)).rejects.toThrow(/row-level security/);
    await expect(insert(staff, "Gurugram", staff, otherCityBay)).rejects.toThrow(/row-level security/);
  });
});
