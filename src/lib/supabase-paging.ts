/**
 * Paging helper for reads that must cover EVERY matching row.
 *
 * PostgREST caps an unbounded select at a server-side row limit (1000 by
 * default). Any total computed from such a read is silently wrong once the
 * period grows — which is exactly how revenue summaries under-reported. Use
 * this whenever a query feeds a total rather than a screen.
 */
export const PAGE_CHUNK = 1000;

type PagedResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAllPaged<T>(
  makeQuery: (from: number, to: number) => PromiseLike<PagedResult<T>>,
  chunk: number = PAGE_CHUNK,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += chunk) {
    const { data, error } = await makeQuery(from, from + chunk - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < chunk) break;
  }
  return rows;
}

/** Same, but for `.in("col", ids)` reads where the id list can be huge. */
export async function fetchAllByIds<T>(
  ids: string[],
  makeQuery: (batch: string[]) => PromiseLike<PagedResult<T>>,
  batchSize = 200,
): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += batchSize) {
    const { data, error } = await makeQuery(unique.slice(i, i + batchSize));
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}
