// View-only Google copies of app block-outs (one-off and weekly) for cities on
// the app calendar. The app decides availability; these entries never block or
// free a slot. Reconciling a whole city is idempotent, so any staff action (or a
// retry) repairs missing, changed or stale copies.

export interface MirrorBlockout { id: string; bay_id: string | null; start_time: string; end_time: string; reason: string | null }
export interface MirrorSeries {
  id: string; bay_id: string | null; days_of_week: number[]; start_local: string; end_local: string;
  starts_on: string; ends_on: string | null; skipped_dates: string[] | null; reason: string | null;
}
export interface MirrorRow { id: string; blockout_id: string | null; series_id: string | null; calendar_id: string; event_id: string; synced_version: string }
export interface MirrorBay { id: string; name: string; calendar: string | null; is_active: boolean }

export interface MirrorInputs {
  timeZone: string;
  cityCalendar: string | null;
  bays: MirrorBay[];
  /** Block-outs that still need a Google copy (not yet over). */
  blockouts: MirrorBlockout[];
  /** Every weekly rule in the city; ended rules still get their end date updated on Google. */
  series: MirrorSeries[];
  /** Rules that ended before today: never copied fresh, only kept in step. */
  finishedIds: Set<string>;
  /** Every source id that still exists in the app, including finished ones. */
  existingSourceIds: Set<string>;
  rows: MirrorRow[];
}

export interface EventBody {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  recurrence?: string[];
  extendedProperties: { private: Record<string, string> };
}

export interface DesiredEntry { sourceKind: "blockout" | "series"; sourceId: string; calendar: string; body: EventBody; version: string }
export interface MirrorPlan { create: DesiredEntry[]; update: { row: MirrorRow; entry: DesiredEntry }[]; remove: MirrorRow[] }

const DESCRIPTION = "Blocked time copied from Golfer's Edge. The app calendar is the record of truth; editing or deleting this entry does not change availability.";
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const hms = (t: string) => {
  const [h = "00", m = "00", s = "00"] = t.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.slice(0, 2).padStart(2, "0")}`;
};
const ymd = (date: string) => date.replaceAll("-", "");
const dow = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

function offsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - utcMs) / 60_000;
}

/** A wall-clock time in a zone, as a UTC instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm, ss] = hms(time).split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  let ms = guess - offsetMinutes(guess, timeZone) * 60_000;
  ms = guess - offsetMinutes(ms, timeZone) * 60_000;
  return new Date(ms);
}

/** Today's date in a zone (YYYY-MM-DD). */
export function localToday(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function summaryFor(bayId: string | null, bays: MirrorBay[], reason: string | null): string {
  const label = bayId ? bays.find((b) => b.id === bayId)?.name ?? "Bay" : "All bays";
  const why = (reason ?? "").trim();
  return `${label} - Blocked${why ? `: ${why}` : ""}`;
}

/** Calendars that show a block: its bay's calendar, or every active bay's for an all-bays block. */
export function targetCalendars(bayId: string | null, bays: MirrorBay[], cityCalendar: string | null): string[] {
  const pick = (b?: MirrorBay) => b?.calendar || cityCalendar;
  const list = bayId ? [pick(bays.find((b) => b.id === bayId))] : bays.filter((b) => b.is_active).map(pick);
  if (!bayId && !list.length) list.push(cityCalendar);
  return [...new Set(list.filter((c): c is string => !!c))];
}

export function blockoutEventBody(b: MirrorBlockout, bays: MirrorBay[], timeZone: string): EventBody {
  return {
    summary: summaryFor(b.bay_id, bays, b.reason),
    description: DESCRIPTION,
    start: { dateTime: new Date(b.start_time).toISOString(), timeZone },
    end: { dateTime: new Date(b.end_time).toISOString(), timeZone },
    extendedProperties: { private: { golfersEdgeBlockout: b.id } },
  };
}

/** One weekly recurring Google event for the rule, or null when it has no occurrences. */
export function seriesEventBody(s: MirrorSeries, bays: MirrorBay[], timeZone: string): EventBody | null {
  const days = [...new Set(s.days_of_week)].sort((a, b) => a - b);
  if (!days.length) return null;
  let first = s.starts_on;
  for (let i = 0; i < 7 && !days.includes(dow(first)); i++) first = addDays(first, 1);
  if (!days.includes(dow(first)) || (s.ends_on && first > s.ends_on)) return null;
  const start = hms(s.start_local);
  let rrule = `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => BYDAY[d]).join(",")}`;
  if (s.ends_on) {
    const until = zonedToUtc(s.ends_on, "23:59:59", timeZone).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    rrule += `;UNTIL=${until}`;
  }
  const skipped = [...new Set(s.skipped_dates ?? [])]
    .filter((d) => d >= first && (!s.ends_on || d <= s.ends_on) && days.includes(dow(d)))
    .sort();
  const recurrence = [rrule];
  if (skipped.length) recurrence.push(`EXDATE;TZID=${timeZone}:${skipped.map((d) => `${ymd(d)}T${start.replaceAll(":", "")}`).join(",")}`);
  return {
    summary: summaryFor(s.bay_id, bays, s.reason),
    description: DESCRIPTION,
    start: { dateTime: `${first}T${start}`, timeZone },
    end: { dateTime: `${first}T${hms(s.end_local)}`, timeZone },
    recurrence,
    extendedProperties: { private: { golfersEdgeBlockoutSeries: s.id } },
  };
}

/** What must change on Google so it shows exactly the app's current block-outs. */
export function planBlockoutMirror(input: MirrorInputs): MirrorPlan {
  const desired = new Map<string, DesiredEntry>();
  const add = (sourceKind: DesiredEntry["sourceKind"], sourceId: string, bayId: string | null, body: EventBody | null) => {
    if (!body) return;
    const version = JSON.stringify(body);
    for (const calendar of targetCalendars(bayId, input.bays, input.cityCalendar)) {
      desired.set(`${sourceId}|${calendar}`, { sourceKind, sourceId, calendar, body, version });
    }
  };
  for (const b of input.blockouts) add("blockout", b.id, b.bay_id, blockoutEventBody(b, input.bays, input.timeZone));
  for (const s of input.series) add("series", s.id, s.bay_id, seriesEventBody(s, input.bays, input.timeZone));

  const live = new Set([...input.blockouts.map((b) => b.id), ...input.series.map((s) => s.id)]);
  const plan: MirrorPlan = { create: [], update: [], remove: [] };
  const seen = new Set<string>();
  for (const row of input.rows) {
    const sourceId = (row.blockout_id ?? row.series_id)!;
    const key = `${sourceId}|${row.calendar_id}`;
    const entry = desired.get(key);
    if (entry) {
      seen.add(key);
      if (entry.version !== row.synced_version) plan.update.push({ row, entry });
    } else if (!input.existingSourceIds.has(sourceId) || live.has(sourceId)) {
      // Removed in the app, or no longer meant for this calendar. Finished blocks keep their copy as history.
      plan.remove.push(row);
    }
  }
  for (const [key, entry] of desired) if (!seen.has(key) && !input.finishedIds.has(entry.sourceId)) plan.create.push(entry);
  return plan;
}

export interface GoogleEventsPort {
  insert(calendar: string, body: EventBody): Promise<string>;
  /** "missing" when the entry was deleted on Google. */
  patch(calendar: string, eventId: string, body: EventBody): Promise<"ok" | "missing">;
  /** Already-deleted entries count as removed. */
  remove(calendar: string, eventId: string): Promise<void>;
}

export interface MirrorStore {
  insertRow(row: { blockout_id: string | null; series_id: string | null; calendar_id: string; event_id: string; synced_version: string }): Promise<"ok" | "duplicate">;
  updateRow(id: string, patch: { event_id?: string; synced_version: string }): Promise<void>;
  deleteRow(id: string): Promise<void>;
}

export interface MirrorResult { created: number; updated: number; removed: number; failed: number }

export async function applyBlockoutMirrorPlan(plan: MirrorPlan, google: GoogleEventsPort, store: MirrorStore): Promise<MirrorResult> {
  const result: MirrorResult = { created: 0, updated: 0, removed: 0, failed: 0 };
  const attempt = async (what: string, run: () => Promise<void>) => {
    try { await run(); } catch (e) {
      result.failed++;
      console.error(`[blockout-mirror] ${what} failed: ${(e as Error).message}`);
    }
  };
  for (const row of plan.remove) {
    await attempt(`remove ${row.id}`, async () => {
      await google.remove(row.calendar_id, row.event_id);
      await store.deleteRow(row.id);
      result.removed++;
    });
  }
  for (const { row, entry } of plan.update) {
    await attempt(`update ${row.id}`, async () => {
      if (await google.patch(row.calendar_id, row.event_id, entry.body) === "missing") {
        const eventId = await google.insert(entry.calendar, entry.body);
        await store.updateRow(row.id, { event_id: eventId, synced_version: entry.version });
      } else {
        await store.updateRow(row.id, { synced_version: entry.version });
      }
      result.updated++;
    });
  }
  for (const entry of plan.create) {
    await attempt(`create ${entry.sourceId}`, async () => {
      const eventId = await google.insert(entry.calendar, entry.body);
      const saved = await store.insertRow({
        blockout_id: entry.sourceKind === "blockout" ? entry.sourceId : null,
        series_id: entry.sourceKind === "series" ? entry.sourceId : null,
        calendar_id: entry.calendar, event_id: eventId, synced_version: entry.version,
      });
      // A concurrent sync already copied it: drop our duplicate entry.
      if (saved === "duplicate") await google.remove(entry.calendar, eventId);
      else result.created++;
    });
  }
  return result;
}

// deno-lint-ignore no-explicit-any
type Admin = any;

async function must<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

/** Reads everything the mirror needs for one city from app records. */
export async function loadBlockoutMirrorInputs(admin: Admin, city: string, timeZone: string, now = new Date()): Promise<MirrorInputs> {
  const today = localToday(now, timeZone);
  const [config, bays, blockouts, series, rows] = await Promise.all([
    admin.from("bay_config").select("calendar_email").eq("city", city).maybeSingle(),
    must<{ id: string; name: string; calendar_email: string | null; is_active: boolean }[]>(
      admin.from("bays").select("id, name, calendar_email, is_active").eq("city", city)),
    must<MirrorBlockout[]>(admin.from("bay_blockouts").select("id, bay_id, start_time, end_time, reason").eq("city", city).gt("end_time", now.toISOString())),
    must<MirrorSeries[]>(admin.from("bay_blockout_series")
      .select("id, bay_id, days_of_week, start_local, end_local, starts_on, ends_on, skipped_dates, reason")
      .eq("city", city)),
    must<MirrorRow[]>(admin.from("bay_blockout_google_events")
      .select("id, blockout_id, series_id, calendar_id, event_id, synced_version").eq("city", city)),
  ]);
  if (config.error) throw new Error(config.error.message);
  const existingSourceIds = new Set<string>([...blockouts.map((b) => b.id), ...series.map((s) => s.id)]);
  const blockoutIds = rows.map((r) => r.blockout_id).filter((id): id is string => !!id && !existingSourceIds.has(id));
  const seriesIds = rows.map((r) => r.series_id).filter((id): id is string => !!id && !existingSourceIds.has(id));
  if (blockoutIds.length) {
    for (const r of await must<{ id: string }[]>(admin.from("bay_blockouts").select("id").in("id", blockoutIds))) existingSourceIds.add(r.id);
  }
  if (seriesIds.length) {
    for (const r of await must<{ id: string }[]>(admin.from("bay_blockout_series").select("id").in("id", seriesIds))) existingSourceIds.add(r.id);
  }
  return {
    timeZone,
    cityCalendar: config.data?.calendar_email ?? null,
    bays: bays.map((b) => ({ id: b.id, name: b.name, calendar: b.calendar_email, is_active: b.is_active })),
    blockouts, series, rows, existingSourceIds,
    finishedIds: new Set(series.filter((s) => s.ends_on && s.ends_on < today).map((s) => s.id)),
  };
}

export function blockoutMirrorStore(admin: Admin, city: string): MirrorStore {
  return {
    async insertRow(row) {
      const { error } = await admin.from("bay_blockout_google_events").insert({ ...row, city });
      if (error?.code === "23505") return "duplicate";
      if (error) throw new Error(error.message);
      return "ok";
    },
    async updateRow(id, patch) {
      const { error } = await admin.from("bay_blockout_google_events").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    async deleteRow(id) {
      const { error } = await admin.from("bay_blockout_google_events").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}
