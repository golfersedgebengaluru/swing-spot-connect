import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveCorporateTag } from "./corporate-tag.ts";

function makeMockClient(opts: {
  profileByUserId?: { corporate_account_id: string | null } | null;
  profileById?: { corporate_account_id: string | null } | null;
  corporate?: { name: string | null } | null;
}) {
  const calls: Array<{ table: string; column: string; value: unknown }> = [];

  const client = {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (column: string, value: unknown) => {
          calls.push({ table, column, value });
          let data: any = null;
          if (table === "profiles" && column === "user_id") data = opts.profileByUserId ?? null;
          else if (table === "profiles" && column === "id") data = opts.profileById ?? null;
          else if (table === "corporate_accounts" && column === "id") data = opts.corporate ?? null;
          return { maybeSingle: async () => ({ data, error: null }) };
        },
      }),
    }),
  };
  return { client, calls };
}

Deno.test("resolveCorporateTag: returns fallback when profileRef is empty", async () => {
  const { client, calls } = makeMockClient({});
  const tag = await resolveCorporateTag(client, null);
  assertEquals(tag, "Guest");
  assertEquals(calls.length, 0);
});

Deno.test("resolveCorporateTag: returns first word of corporate name (auth-account match)", async () => {
  const { client } = makeMockClient({
    profileByUserId: { corporate_account_id: "corp-1" },
    corporate: { name: "Apexlynx Pvt Ltd" },
  });
  const tag = await resolveCorporateTag(client, "auth-uuid");
  assertEquals(tag, "Apexlynx");
});

Deno.test("resolveCorporateTag: falls back to profiles.id lookup when user_id misses", async () => {
  const { client, calls } = makeMockClient({
    profileByUserId: null,
    profileById: { corporate_account_id: "corp-2" },
    corporate: { name: "Globex Corporation" },
  });
  const tag = await resolveCorporateTag(client, "profile-id");
  assertEquals(tag, "Globex");
  // Two profile lookups + one corporate lookup
  assertEquals(calls.length, 3);
});

Deno.test("resolveCorporateTag: returns Guest when profile has no corporate", async () => {
  const { client } = makeMockClient({
    profileByUserId: { corporate_account_id: null },
    profileById: null,
  });
  const tag = await resolveCorporateTag(client, "some-id");
  assertEquals(tag, "Guest");
});

Deno.test("resolveCorporateTag: returns Guest when corporate row missing or name empty", async () => {
  const { client } = makeMockClient({
    profileByUserId: { corporate_account_id: "corp-x" },
    corporate: { name: null },
  });
  const tag = await resolveCorporateTag(client, "some-id");
  assertEquals(tag, "Guest");
});

Deno.test("resolveCorporateTag: strips punctuation from first word", async () => {
  const { client } = makeMockClient({
    profileByUserId: { corporate_account_id: "corp-3" },
    corporate: { name: "Acme, Inc." },
  });
  const tag = await resolveCorporateTag(client, "x");
  assertEquals(tag, "Acme");
});

Deno.test("resolveCorporateTag: single-word corporate name returned as-is", async () => {
  const { client } = makeMockClient({
    profileByUserId: { corporate_account_id: "corp-4" },
    corporate: { name: "Initech" },
  });
  const tag = await resolveCorporateTag(client, "x");
  assertEquals(tag, "Initech");
});

Deno.test("resolveCorporateTag: custom fallback respected", async () => {
  const { client } = makeMockClient({});
  const tag = await resolveCorporateTag(client, null, "Member");
  assertEquals(tag, "Member");
});
