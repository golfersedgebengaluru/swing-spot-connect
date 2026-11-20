import { describe, expect, it, vi } from "vitest";
import {
  applyBlockoutMirrorPlan, planBlockoutMirror, seriesEventBody, zonedToUtc,
  type MirrorInputs, type MirrorRow, type MirrorSeries,
} from "../../../supabase/functions/calendar-sync/blockout-mirror";

const TZ = "Asia/Kolkata";
const bays = [
  { id: "bay-1", name: "Chennai Bay #1", calendar: "bay1@cal", is_active: true },
  { id: "bay-2", name: "Chennai Bay #2", calendar: null, is_active: true },
];
// Bharath Tngf, 20 Nov 2026 10:00 AM – 1:00 PM IST on Chennai Bay #1.
const bharath = { id: "blk-1", bay_id: "bay-1", start_time: "2026-11-20T04:30:00Z", end_time: "2026-11-20T07:30:00Z", reason: "Bharath Tngf" };
const weekly: MirrorSeries = {
  id: "ser-1", bay_id: null, days_of_week: [2, 4], start_local: "19:00:00", end_local: "20:00:00",
  starts_on: "2026-11-01", ends_on: "2026-12-31", skipped_dates: ["2026-11-10"], reason: "Coaching",
};
const inputs = (over: Partial<MirrorInputs> = {}): MirrorInputs => ({
  timeZone: TZ, cityCalendar: "city@cal", bays, blockouts: [], series: [], rows: [],
  existingSourceIds: new Set(), finishedIds: new Set(), ...over,
});
const row = (over: Partial<MirrorRow>): MirrorRow => ({
  id: "row-1", blockout_id: null, series_id: null, calendar_id: "bay1@cal", event_id: "evt-1", synced_version: "", ...over,
});

describe("Google copy of blocked times", () => {
  it("copies a one-off block to its bay's Google calendar with the reason and times", () => {
    const plan = planBlockoutMirror(inputs({ blockouts: [bharath], existingSourceIds: new Set(["blk-1"]) }));
    expect(plan.create).toHaveLength(1);
    const [entry] = plan.create;
    expect(entry.calendar).toBe("bay1@cal");
    expect(entry.body.summary).toBe("Chennai Bay #1 - Blocked: Bharath Tngf");
    expect(entry.body.start.dateTime).toBe("2026-11-20T04:30:00.000Z");
    expect(entry.body.end.dateTime).toBe("2026-11-20T07:30:00.000Z");
  });

  it("copies an all-bays block once to each calendar the bays use", () => {
    const all = { ...bharath, bay_id: null };
    const plan = planBlockoutMirror(inputs({ blockouts: [all], existingSourceIds: new Set(["blk-1"]) }));
    expect(plan.create.map((e) => e.calendar).sort()).toEqual(["bay1@cal", "city@cal"]);
    expect(plan.create[0].body.summary).toBe("All bays - Blocked: Bharath Tngf");
  });

  it("does nothing when the copy is already up to date", () => {
    const first = planBlockoutMirror(inputs({ blockouts: [bharath], existingSourceIds: new Set(["blk-1"]) })).create[0];
    const plan = planBlockoutMirror(inputs({
      blockouts: [bharath], existingSourceIds: new Set(["blk-1"]),
      rows: [row({ blockout_id: "blk-1", synced_version: first.version })],
    }));
    expect(plan).toEqual({ create: [], update: [], remove: [] });
  });

  it("removes the Google entry once the block is removed in the app", () => {
    const plan = planBlockoutMirror(inputs({ rows: [row({ blockout_id: "blk-1" })] }));
    expect(plan.remove.map((r) => r.id)).toEqual(["row-1"]);
  });

  it("keeps the Google entry of a block that has simply finished", () => {
    const plan = planBlockoutMirror(inputs({ existingSourceIds: new Set(["blk-1"]), rows: [row({ blockout_id: "blk-1" })] }));
    expect(plan.remove).toEqual([]);
  });

  it("copies a weekly block as one repeating Google entry in the centre's local time", () => {
    const body = seriesEventBody(weekly, bays, TZ)!;
    expect(body.start).toEqual({ dateTime: "2026-11-03T19:00:00", timeZone: TZ }); // first Tuesday on or after 1 Nov
    expect(body.end).toEqual({ dateTime: "2026-11-03T20:00:00", timeZone: TZ });
    expect(body.recurrence).toEqual([
      "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261231T182959Z", // 31 Dec 23:59:59 IST
      "EXDATE;TZID=Asia/Kolkata:20261110T190000",
    ]);
  });

  it("repeats with no end when the weekly block has no end date", () => {
    expect(seriesEventBody({ ...weekly, ends_on: null, skipped_dates: [] }, bays, TZ)!.recurrence).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=TU,TH"]);
  });

  it("updates the repeating entry when one day is removed", () => {
    const synced = planBlockoutMirror(inputs({ series: [weekly], existingSourceIds: new Set(["ser-1"]) })).create;
    const rows = synced.map((e, i) => row({ id: `row-${i}`, series_id: "ser-1", calendar_id: e.calendar, synced_version: e.version }));
    const skipped = { ...weekly, skipped_dates: ["2026-11-10", "2026-11-12"] };
    const plan = planBlockoutMirror(inputs({ series: [skipped], existingSourceIds: new Set(["ser-1"]), rows }));
    expect(plan.update).toHaveLength(2);
    expect(plan.update[0].entry.body.recurrence?.[1]).toBe("EXDATE;TZID=Asia/Kolkata:20261110T190000,20261112T190000");
  });

  it("does not create fresh copies of weekly blocks that already ended", () => {
    const old = { ...weekly, ends_on: "2026-11-15" };
    const plan = planBlockoutMirror(inputs({ series: [old], existingSourceIds: new Set(["ser-1"]), finishedIds: new Set(["ser-1"]) }));
    expect(plan.create).toEqual([]);
  });

  it("converts the centre's wall-clock time to the right instant", () => {
    expect(zonedToUtc("2026-11-20", "10:00", TZ).toISOString()).toBe("2026-11-20T04:30:00.000Z");
  });
});

describe("applying the Google copy", () => {
  const entry = () => planBlockoutMirror(inputs({ blockouts: [bharath], existingSourceIds: new Set(["blk-1"]) })).create[0];

  it("records the Google entry after copying a block", async () => {
    const google = { insert: vi.fn().mockResolvedValue("evt-9"), patch: vi.fn(), remove: vi.fn() };
    const store = { insertRow: vi.fn().mockResolvedValue("ok"), updateRow: vi.fn(), deleteRow: vi.fn() };
    const result = await applyBlockoutMirrorPlan({ create: [entry()], update: [], remove: [] }, google, store);
    expect(result).toEqual({ created: 1, updated: 0, removed: 0, failed: 0 });
    expect(store.insertRow).toHaveBeenCalledWith(expect.objectContaining({ blockout_id: "blk-1", calendar_id: "bay1@cal", event_id: "evt-9" }));
  });

  it("deletes its own duplicate when another sync copied the block first", async () => {
    const google = { insert: vi.fn().mockResolvedValue("evt-9"), patch: vi.fn(), remove: vi.fn().mockResolvedValue(undefined) };
    const store = { insertRow: vi.fn().mockResolvedValue("duplicate"), updateRow: vi.fn(), deleteRow: vi.fn() };
    const result = await applyBlockoutMirrorPlan({ create: [entry()], update: [], remove: [] }, google, store);
    expect(google.remove).toHaveBeenCalledWith("bay1@cal", "evt-9");
    expect(result.created).toBe(0);
  });

  it("re-creates a copy that someone deleted on Google", async () => {
    const e = entry();
    const google = { insert: vi.fn().mockResolvedValue("evt-new"), patch: vi.fn().mockResolvedValue("missing"), remove: vi.fn() };
    const store = { insertRow: vi.fn(), updateRow: vi.fn().mockResolvedValue(undefined), deleteRow: vi.fn() };
    await applyBlockoutMirrorPlan({ create: [], update: [{ row: row({ blockout_id: "blk-1" }), entry: e }], remove: [] }, google, store);
    expect(store.updateRow).toHaveBeenCalledWith("row-1", { event_id: "evt-new", synced_version: e.version });
  });

  it("keeps the record when Google refuses a removal, so the next sync retries", async () => {
    const google = { insert: vi.fn(), patch: vi.fn(), remove: vi.fn().mockRejectedValue(new Error("Google down")) };
    const store = { insertRow: vi.fn(), updateRow: vi.fn(), deleteRow: vi.fn() };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await applyBlockoutMirrorPlan({ create: [], update: [], remove: [row({ blockout_id: "blk-1" })] }, google, store);
    expect(result.failed).toBe(1);
    expect(store.deleteRow).not.toHaveBeenCalled();
  });
});
