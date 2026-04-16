import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const BASE_URL = `${SUPABASE_URL}/functions/v1/league-service`;

async function fetchAPI(path: string, method: string, body?: any, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

// ── Auth gate tests ──────────────────────────────────────────
Deno.test("league-service: unauthenticated request returns 401", async () => {
  const { status, data } = await fetchAPI("/tenants", "GET");
  assertEquals(status, 401);
  assertEquals(data.error, "Unauthorized");
});

Deno.test("league-service: OPTIONS returns CORS headers", async () => {
  const res = await fetch(`${BASE_URL}/tenants`, {
    method: "OPTIONS",
    headers: { apikey: SUPABASE_ANON_KEY },
  });
  const body = await res.text();
  assertEquals(res.status, 200);
  assertExists(res.headers.get("access-control-allow-origin"));
});

Deno.test("league-service: unknown route returns 401 without auth", async () => {
  const { status } = await fetchAPI("/nonexistent", "GET");
  assertEquals(status, 401);
});

Deno.test("league-service: POST /tenants without auth returns 401", async () => {
  const { status } = await fetchAPI("/tenants", "POST", { name: "Test", city: "Mumbai" });
  assertEquals(status, 401);
});

Deno.test("league-service: POST /join without auth returns 401", async () => {
  const { status } = await fetchAPI("/join", "POST", { code: "ABC123" });
  assertEquals(status, 401);
});

// ── Bay scheduling auth gate tests ───────────────────────────
Deno.test("league-service: GET bay-bookings without auth returns 401", async () => {
  const { status } = await fetchAPI("/leagues/fake-id/bay-bookings", "GET");
  assertEquals(status, 401);
});

Deno.test("league-service: POST bay-bookings without auth returns 401", async () => {
  const { status } = await fetchAPI("/leagues/fake-id/bay-bookings", "POST", {
    bay_id: "fake",
    scheduled_at: "2026-05-01T10:00:00Z",
  });
  assertEquals(status, 401);
});

Deno.test("league-service: GET bay-availability without auth returns 401", async () => {
  const { status } = await fetchAPI("/leagues/fake-id/bay-availability?date=2026-05-01", "GET");
  assertEquals(status, 401);
});

Deno.test("league-service: POST bay-blocks without auth returns 401", async () => {
  const { status } = await fetchAPI("/leagues/fake-id/bay-blocks", "POST", {
    bay_id: "fake",
    blocked_from: "2026-05-01T10:00:00Z",
    blocked_to: "2026-05-01T12:00:00Z",
  });
  assertEquals(status, 401);
});

Deno.test("league-service: cancel booking without auth returns 401", async () => {
  const { status } = await fetchAPI("/leagues/fake-id/bay-bookings/fake-booking?action=cancel", "POST", {});
  assertEquals(status, 401);
});

Deno.test("league-service: join booking without auth returns 401", async () => {
  const { status } = await fetchAPI("/leagues/fake-id/bay-bookings/fake-booking?action=join", "POST", {});
  assertEquals(status, 401);
});

Deno.test("league-service: reschedule without auth returns 401", async () => {
  const { status } = await fetchAPI("/leagues/fake-id/bay-bookings/fake-booking", "PATCH", {
    scheduled_at: "2026-05-02T10:00:00Z",
  });
  assertEquals(status, 401);
});

// ── Team auth gate tests ────────────────────────────────────
Deno.test("league-service: GET teams without auth returns 401", async () => {
  const { status } = await fetchAPI("/leagues/fake-id/teams", "GET");
  assertEquals(status, 401);
});

Deno.test("league-service: POST teams without auth returns 401", async () => {
  const { status } = await fetchAPI("/leagues/fake-id/teams", "POST", { name: "Test Team" });
  assertEquals(status, 401);
});

Deno.test("league-service: PATCH team without auth returns 401", async () => {
  const { status } = await fetchAPI("/leagues/fake-id/teams/fake-team", "PATCH", { name: "Updated" });
  assertEquals(status, 401);
});

Deno.test("league-service: DELETE team without auth returns 401", async () => {
  const { status } = await fetchAPI("/leagues/fake-id/teams/fake-team", "DELETE");
  assertEquals(status, 401);
});

Deno.test("league-service: POST team member without auth returns 401", async () => {
  const { status } = await fetchAPI("/leagues/fake-id/teams/fake-team/members", "POST", { player_id: "fake" });
  assertEquals(status, 401);
});

Deno.test("league-service: DELETE team member without auth returns 401", async () => {
  const { status } = await fetchAPI("/leagues/fake-id/teams/fake-team/members/fake-member", "DELETE");
  assertEquals(status, 401);
});
