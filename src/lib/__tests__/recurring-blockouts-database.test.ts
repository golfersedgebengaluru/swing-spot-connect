// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const bay1 = "00000000-0000-0000-0000-000000000001";
const bay2 = "00000000-0000-0000-0000-000000000002";
const staff = "00000000-0000-0000-0000-0000000000a1";
const member = "00000000-0000-0000-0000-0000000000b1";
// Tuesday 1 Dec 2026, 7–8 PM IST
const START = "2026-12-01T13:30:00Z";
const END = "2026-12-01T14:30:00Z";
const TUE = 2;
let db: PGlite;

const migration = (name: string) => readFileSync(`drizzle/migrations/${name}`, "utf8").replace(/--> statement-breakpoint/g, "");

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
  await db.exec(migration("0019_app_calendar_record_of_truth.sql"));
  await db.exec(migration("0020_recurring_bay_blockouts.sql"));
  await db.exec(`INSERT INTO bay_config(city, timezone) VALUES ('Gurugram', 'Asia/Kolkata');
    INSERT INTO bays(id, city, name, sort_order, bay_type) VALUES
    ('${bay1}','Gurugram','Bay #1',1,'standard'),('${bay2}','Gurugram','Bay #2',2,'standard');`);
}, 30000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE bookings, bay_holds, bay_blockouts, bay_blockout_series, league_bay_blocks;`);
});

const addSeries = (opts: { bay?: string | null; days?: number[]; from?: string; to?: string; startsOn?: string; endsOn?: string | null; skipped?: string[] } = {}) =>
  db.query<{ id: string }>(
    `INSERT INTO bay_blockout_series(city, bay_id, days_of_week, start_local, end_local, starts_on, ends_on, skipped_dates, reason)
     VALUES ('Gurugram', $1, $2, $3, $4, $5, $6, $7, 'Coaching') RETURNING id`,
    [opts.bay === undefined ? null : opts.bay, opts.days ?? [TUE], opts.from ?? "19:00", opts.to ?? "20:00",
      opts.startsOn ?? "2026-11-01", opts.endsOn ?? null, opts.skipped ?? []],
  ).then((r) => r.rows[0].id);

const reserve = async (start = START, end = END, preferred = bay1, type: string | null = "standard") =>
  (await db.query<{ bay_id: string }>("SELECT * FROM reserve_bay_slot('Gurugram', $1, $2, $3, $4, 10, NULL)", [type, preferred, start, end])).rows[0] ?? null;

const asActor = async <T,>(actor: string, run: () => Promise<T>) => {
  await db.exec(`SET test.actor='${actor}'; SET ROLE authenticated;`);
  try { return await run(); } finally { await db.exec("RESET ROLE"); }
};

describe("weekly repeating block-outs stop bookings", () => {
  it("blocks every bay on the repeat day and time (all bays)", async () => {
    await addSeries();
    expect(await reserve()).toBeNull();
  });

  it("blocks the same time in later weeks with no end date", async () => {
    await addSeries();
    expect(await reserve("2027-03-02T13:30:00Z", "2027-03-02T14:30:00Z")).toBeNull();
  });

  it("does not block other weekdays or times outside the block", async () => {
    await addSeries();
    expect((await reserve("2026-12-02T13:30:00Z", "2026-12-02T14:30:00Z"))?.bay_id).toBe(bay1); // Wednesday
    expect((await reserve("2026-12-01T14:30:00Z", "2026-12-01T15:30:00Z"))?.bay_id).toBe(bay1); // 8–9 PM Tuesday
  });

  it("does not block before the start date or after the end date", async () => {
    await addSeries({ startsOn: "2026-12-08" });
    expect(await reserve()).not.toBeNull();
    await db.exec("TRUNCATE bay_holds, bay_blockout_series");
    await addSeries({ endsOn: "2026-11-24" });
    expect(await reserve()).not.toBeNull();
  });

  it("includes the end date itself", async () => {
    await addSeries({ endsOn: "2026-12-01" });
    expect(await reserve()).toBeNull();
  });

  it("skips a day removed on its own", async () => {
    await addSeries({ skipped: ["2026-12-01"] });
    expect(await reserve()).not.toBeNull();
  });

  it("blocks only the chosen bay, leaving another bay of the type free", async () => {
    await addSeries({ bay: bay1 });
    expect((await reserve())?.bay_id).toBe(bay2);
    expect(await reserve(START, END, bay1, null)).toBeNull();
  });

  it("uses the centre's local time, not UTC", async () => {
    // 7–8 PM IST every Tuesday is 13:30–14:30 UTC; 19:00 UTC Tuesday must stay free.
    await addSeries();
    expect(await reserve("2026-12-01T19:00:00Z", "2026-12-01T20:00:00Z")).not.toBeNull();
  });
});

describe("staff day view and removal", () => {
  it("shows the repeating block on its day", async () => {
    const id = await addSeries();
    const rows = await asActor(staff, () =>
      db.query<{ kind: string; id: string; label: string }>("SELECT kind, id, label FROM bay_day_schedule('Gurugram', '2026-11-30T18:30:00Z', '2026-12-01T18:30:00Z')"));
    expect(rows.rows).toEqual([{ kind: "recurring_blockout", id, label: "Coaching" }]);
  });

  it("removes only one day, keeping later weeks blocked", async () => {
    const id = await addSeries();
    await asActor(staff, () => db.query("SELECT remove_bay_blockout_occurrence($1, '2026-12-01', 'day')", [id]));
    expect(await reserve()).not.toBeNull();
    expect(await reserve("2026-12-08T13:30:00Z", "2026-12-08T14:30:00Z")).toBeNull();
  });

  it("ends the series from a day onward, keeping earlier weeks", async () => {
    const id = await addSeries();
    await asActor(staff, () => db.query("SELECT remove_bay_blockout_occurrence($1, '2026-12-08', 'following')", [id]));
    expect(await reserve("2026-12-08T13:30:00Z", "2026-12-08T14:30:00Z")).not.toBeNull();
    expect(await reserve()).toBeNull();
    const row = await db.query<{ ends_on: string }>("SELECT ends_on::text FROM bay_blockout_series WHERE id = $1", [id]);
    expect(row.rows[0].ends_on).toBe("2026-12-07");
  });

  it("deletes the series when removed from its first day onward", async () => {
    const id = await addSeries({ startsOn: "2026-12-01" });
    await asActor(staff, () => db.query("SELECT remove_bay_blockout_occurrence($1, '2026-12-01', 'following')", [id]));
    expect((await db.query("SELECT 1 FROM bay_blockout_series")).rows).toHaveLength(0);
  });

  it("refuses removal by someone without access to the city", async () => {
    const id = await addSeries();
    await expect(asActor(member, () => db.query("SELECT remove_bay_blockout_occurrence($1, '2026-12-01', 'day')", [id]))).rejects.toThrow();
    expect(await reserve()).toBeNull();
  });

  it("lets staff add a repeating block only for their own city, as themselves", async () => {
    const insert = (actor: string, city: string, createdBy: string) => asActor(actor, () =>
      db.query("INSERT INTO bay_blockout_series(city, days_of_week, start_local, end_local, starts_on, created_by) VALUES ($1, '{2}', '19:00', '20:00', '2026-11-01', $2)", [city, createdBy]));
    await expect(insert(staff, "Gurugram", staff)).resolves.toBeTruthy();
    await expect(insert(staff, "Chennai", staff)).rejects.toThrow();
    await expect(insert(staff, "Gurugram", member)).rejects.toThrow();
    await expect(insert(member, "Gurugram", member)).rejects.toThrow();
  });

  it("refuses a block whose end time is not after its start time", async () => {
    await expect(addSeries({ from: "20:00", to: "19:00" })).rejects.toThrow();
  });
});
