import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { createClient as SupabaseClientFactory } from "npm:@supabase/supabase-js@2";
import { handleProcessAutoGifts } from "./index.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

type RecordedCall = { table: string; operation: string; value?: unknown };

function createHarness(authenticatedUserId: string | null) {
  const calls: RecordedCall[] = [];

  const createClient = (_url: string, key: string) => {
    if (key === "anon-key") {
      return {
        auth: {
          getUser: async (token?: string) => ({
            data: { user: token === "valid-user-token" && authenticatedUserId ? { id: authenticatedUserId } : null },
            error: token === "valid-user-token" && authenticatedUserId ? null : new Error("Invalid token"),
          }),
        },
      };
    }

    return {
      from: (table: string) => {
        const chain = {
          select: () => chain,
          eq: (_column: string, value: unknown) => {
            calls.push({ table, operation: "eq", value });
            return chain;
          },
          insert: async (value: unknown) => {
            calls.push({ table, operation: "insert", value });
            return { error: null };
          },
          then: (resolve: (value: unknown) => unknown) => {
            if (table === "auto_gift_rules") {
              return Promise.resolve(resolve({
                data: [{
                  name: "Welcome",
                  reward_name: "Free coffee",
                  reward_description: "Welcome reward",
                  max_per_user: 1,
                }],
                error: null,
              }));
            }
            return Promise.resolve(resolve({ count: 0, error: null }));
          },
        };
        return chain;
      },
    };
  };

  return { calls, createClient };
}

function request(token?: string, body: Record<string, unknown> = { trigger_event: "signup" }) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request("https://example.test/process-auto-gifts", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const env = {
  SUPABASE_URL: "https://example.test",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
};

function compatibleFactory(factory: ReturnType<typeof createHarness>["createClient"]) {
  return factory as unknown as typeof SupabaseClientFactory;
}

Deno.test("rejects an anonymous anon-key request before database access", async () => {
  const harness = createHarness(null);
  const response = await handleProcessAutoGifts(request(), compatibleFactory(harness.createClient), env);

  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "Unauthorized" });
  assertEquals(harness.calls, []);
});

Deno.test("rejects a service-role or other privileged non-user token", async () => {
  const harness = createHarness(null);
  const response = await handleProcessAutoGifts(
    request("service-role-token"),
    compatibleFactory(harness.createClient),
    env,
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "Unauthorized" });
  assertEquals(harness.calls, []);
});

Deno.test("ignores a forged user_id and uses one validated identity throughout", async () => {
  const harness = createHarness(USER_ID);
  const response = await handleProcessAutoGifts(
    request("valid-user-token", { user_id: OTHER_USER_ID, trigger_event: "signup" }),
    compatibleFactory(harness.createClient),
    env,
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { gifted: 1, message: "1 gift(s) awarded" });

  const identityValues = harness.calls
    .filter((call) => call.operation === "eq" && call.value === USER_ID);
  assertEquals(identityValues.length, 1);

  const gift = harness.calls.find((call) => call.table === "gifted_rewards" && call.operation === "insert");
  const notification = harness.calls.find((call) => call.table === "notifications" && call.operation === "insert");
  assertEquals((gift?.value as { user_id: string }).user_id, USER_ID);
  assertEquals((notification?.value as { user_id: string }).user_id, USER_ID);
  assertEquals(JSON.stringify(harness.calls).includes(OTHER_USER_ID), false);
});

Deno.test("returns an error and does not report a gift when the gift write fails", async () => {
  const harness = createHarness(USER_ID);
  const originalCreateClient = harness.createClient;
  const failingCreateClient = (url: string, key: string) => {
    const client = originalCreateClient(url, key);
    if (key === "anon-key") return client;
    const originalFrom = client.from;
    return {
      ...client,
      from: (table: string) => {
        const chain = originalFrom(table);
        if (table !== "gifted_rewards") return chain;
        return { ...chain, insert: async () => ({ error: new Error("write failed") }) };
      },
    };
  };

  const response = await handleProcessAutoGifts(
    request("valid-user-token"),
    compatibleFactory(failingCreateClient),
    env,
  );
  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: "Internal server error" });
});