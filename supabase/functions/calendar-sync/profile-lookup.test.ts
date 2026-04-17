import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveProfileDisplayName } from "./profile-lookup.ts";

/**
 * Build a mock Supabase client that records each `.eq()` lookup and returns
 * canned data based on which column was queried.
 */
function makeMockClient(rows: {
  byUserId?: { display_name: string | null } | null;
  byId?: { display_name: string | null } | null;
}) {
  const calls: Array<{ column: string; value: unknown }> = [];

  const builder = (column: string, value: unknown) => {
    calls.push({ column, value });
    const data =
      column === "user_id"
        ? rows.byUserId ?? null
        : column === "id"
        ? rows.byId ?? null
        : null;
    return {
      maybeSingle: async () => ({ data, error: null }),
    };
  };

  const client = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (column: string, value: unknown) => builder(column, value),
      }),
    }),
  };

  return { client, calls };
}

Deno.test("resolveProfileDisplayName: returns fallback when bookingUserId is empty", async () => {
  const { client, calls } = makeMockClient({});
  const name = await resolveProfileDisplayName(client, null, "Member");
  assertEquals(name, "Member");
  assertEquals(calls.length, 0); // no DB calls when id is missing
});

Deno.test("resolveProfileDisplayName: matches by profiles.user_id (auth-account member)", async () => {
  const { client, calls } = makeMockClient({
    byUserId: { display_name: "Dushyant Srivatsa" },
  });
  const name = await resolveProfileDisplayName(client, "auth-uuid-123");
  assertEquals(name, "Dushyant Srivatsa");
  // Should short-circuit — only one lookup needed.
  assertEquals(calls.length, 1);
  assertEquals(calls[0].column, "user_id");
});

Deno.test("resolveProfileDisplayName: falls back to profiles.id for profile-only member", async () => {
  // Simulates Sai Prasanna's case: profiles.user_id is NULL, so the booking's
  // user_id field actually holds his profiles.id.
  const { client, calls } = makeMockClient({
    byUserId: null,
    byId: { display_name: "Sai Prasanna Gnanavelu" },
  });
  const name = await resolveProfileDisplayName(client, "profile-id-456");
  assertEquals(name, "Sai Prasanna Gnanavelu");
  assertEquals(calls.length, 2);
  assertEquals(calls[0].column, "user_id");
  assertEquals(calls[1].column, "id");
});

Deno.test("resolveProfileDisplayName: returns fallback when neither key matches", async () => {
  const { client } = makeMockClient({ byUserId: null, byId: null });
  const name = await resolveProfileDisplayName(client, "unknown", "A member");
  assertEquals(name, "A member");
});

Deno.test("resolveProfileDisplayName: treats empty display_name as missing and falls through", async () => {
  // Profile row exists but display_name is null — should still try the other key.
  const { client, calls } = makeMockClient({
    byUserId: { display_name: null },
    byId: { display_name: "Hari & Bharath" },
  });
  const name = await resolveProfileDisplayName(client, "some-id");
  assertEquals(name, "Hari & Bharath");
  assertEquals(calls.length, 2);
});

Deno.test("resolveProfileDisplayName: uses default fallback 'Member' when not specified", async () => {
  const { client } = makeMockClient({});
  const name = await resolveProfileDisplayName(client, "x");
  assertEquals(name, "Member");
});
