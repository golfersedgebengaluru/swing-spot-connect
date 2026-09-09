import { describe, it, expect, vi } from "vitest";
import { fetchAllPaged, fetchAllByIds, PAGE_CHUNK } from "@/lib/supabase-paging";

const row = (i: number) => ({ id: `r${i}`, amount: 1 });

describe("fetchAllPaged", () => {
  it("returns every row across pages, not just the first chunk", async () => {
    const total = 2300;
    const all = Array.from({ length: total }, (_, i) => row(i));
    const calls: Array<[number, number]> = [];

    const rows = await fetchAllPaged<any>(async (from, to) => {
      calls.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    });

    expect(rows).toHaveLength(total);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(total);
    expect(calls[0]).toEqual([0, PAGE_CHUNK - 1]);
    expect(calls).toHaveLength(3);
  });

  it("stops after a short page (no infinite loop)", async () => {
    const fetcher = vi.fn(async (from: number) => ({
      data: from === 0 ? [row(1)] : [],
      error: null,
    }));
    const rows = await fetchAllPaged<any>((from, to) => fetcher(from));
    expect(rows).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("stops on an exactly-full final page", async () => {
    const all = Array.from({ length: PAGE_CHUNK }, (_, i) => row(i));
    let pages = 0;
    const rows = await fetchAllPaged<any>(async (from, to) => {
      pages += 1;
      return { data: all.slice(from, to + 1), error: null };
    });
    expect(rows).toHaveLength(PAGE_CHUNK);
    expect(pages).toBe(2); // second page comes back empty and ends the loop
  });

  it("throws instead of returning a partial total when a page fails", async () => {
    await expect(
      fetchAllPaged<any>(async (from) =>
        from === 0 ? { data: Array.from({ length: PAGE_CHUNK }, (_, i) => row(i)), error: null } : { data: null, error: { message: "boom" } },
      ),
    ).rejects.toMatchObject({ message: "boom" });
  });

  it("handles an empty result set", async () => {
    const rows = await fetchAllPaged<any>(async () => ({ data: [], error: null }));
    expect(rows).toEqual([]);
  });
});

describe("fetchAllByIds", () => {
  it("batches large id lists and concatenates results", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id${i}`);
    const batches: number[] = [];
    const rows = await fetchAllByIds<any>(ids, async (batch) => {
      batches.push(batch.length);
      return { data: batch.map((id) => ({ id })), error: null };
    });
    expect(rows).toHaveLength(450);
    expect(batches).toEqual([200, 200, 50]);
  });

  it("dedupes and drops empty ids", async () => {
    const seen: string[][] = [];
    await fetchAllByIds<any>(["a", "a", "", "b"], async (batch) => {
      seen.push(batch);
      return { data: [], error: null };
    });
    expect(seen).toEqual([["a", "b"]]);
  });

  it("makes no request for an empty id list", async () => {
    const fetcher = vi.fn(async () => ({ data: [], error: null }));
    const rows = await fetchAllByIds<any>([], fetcher);
    expect(rows).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("propagates errors", async () => {
    await expect(
      fetchAllByIds<any>(["a"], async () => ({ data: null, error: { message: "nope" } })),
    ).rejects.toMatchObject({ message: "nope" });
  });
});
