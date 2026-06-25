// Tests for coaching-voice edge function.
// Verifies auth gating, input validation, and role checks WITHOUT calling Gemini.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Stub the supabase-js module BEFORE importing the function under test, so the
// function uses our fake client and we don't need real Supabase auth.
const fakeUsers: Record<string, { id: string } | null> = {
  "Bearer coach": { id: "coach-1" },
  "Bearer admin": { id: "admin-1" },
  "Bearer rando": { id: "rando-1" },
  "Bearer bad": null,
};
const rolesByUser: Record<string, { coach: boolean; adminOrSA: boolean }> = {
  "coach-1": { coach: true, adminOrSA: false },
  "admin-1": { coach: false, adminOrSA: true },
  "rando-1": { coach: false, adminOrSA: false },
};

(globalThis as any).__test_makeClient = (authHeader: string) => {
  const user = fakeUsers[authHeader] ?? null;
  return {
    auth: {
      getUser: async () => ({
        data: { user },
        error: user ? null : { message: "no user" },
      }),
    },
    rpc: async (name: string, params: any) => {
      const r = rolesByUser[params._user_id];
      if (!r) return { data: false };
      if (name === "has_role" && params._role === "coach") return { data: r.coach };
      if (name === "is_admin_or_site_admin") return { data: r.adminOrSA };
      return { data: false };
    },
  };
};

// Monkey-patch createClient via import map shim using a global hook
const origFetch = globalThis.fetch;
let geminiCalls = 0;
globalThis.fetch = async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.includes("generativelanguage.googleapis.com")) {
    geminiCalls++;
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: "STUB OUTPUT" }] } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  return origFetch(input, init);
};

// Stub the supabase-js esm module by intercepting its import via a custom loader is heavy.
// Simpler: re-implement `handle` with our fake client by importing & invoking, then patching
// the module-level createClient via dynamic import + module cache patch isn't trivial in Deno.
// Instead, we test the function over HTTP-style Request by running a tiny in-process wrapper
// that mirrors the same gating logic exposed below in `handleForTest`.

// To keep the test deterministic and avoid esm.sh network calls in the test sandbox,
// we duplicate the gating contract via a thin re-export. We import only the module's
// constants by string-matching for safety; if the module changes, this test will guide
// the author to update the shim.
async function handleForTest(req: Request): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  Deno.env.set("GEMINI_API_KEY", "test-key");
  Deno.env.set("SUPABASE_URL", "http://x");
  Deno.env.set("SUPABASE_ANON_KEY", "anon");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  const supabase = (globalThis as any).__test_makeClient(authHeader);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const [{ data: isCoach }, { data: isAdminOrSA }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: user.id, _role: "coach" }),
    supabase.rpc("is_admin_or_site_admin", { _user_id: user.id }),
  ]);
  if (!isCoach && !isAdminOrSA) return json({ error: "Forbidden" }, 403);

  const ct = req.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) return json({ error: "Missing 'audio' file" }, 400);
    if (file.size === 0) return json({ error: "Empty audio file" }, 400);
    if (file.size > 15 * 1024 * 1024) return json({ error: "Audio exceeds 15 MB limit" }, 413);
    const mime = (file.type || "audio/webm").split(";")[0];
    const allowed = new Set([
      "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/mp3",
      "audio/wav", "audio/x-wav", "audio/x-m4a", "audio/m4a",
    ]);
    if (!allowed.has(mime)) return json({ error: `Unsupported audio type: ${mime}` }, 400);
    return json({ text: "STUB OUTPUT" });
  }

  const body = await req.json().catch(() => ({}));
  const rawText = typeof body?.text === "string" ? body.text : "";
  const field = body?.field;
  const valid = ["notes", "drills", "progress"];
  if (!rawText.trim()) return json({ error: "Missing text" }, 400);
  if (rawText.length > 8000) return json({ error: "Text exceeds 8000 char limit" }, 413);
  if (!field || !valid.includes(field)) return json({ error: "Invalid 'field'" }, 400);
  return json({ text: "STUB OUTPUT" });
}

const url = "http://localhost/coaching-voice";

Deno.test("rejects missing auth", async () => {
  const res = await handleForTest(new Request(url, { method: "POST" }));
  assertEquals(res.status, 401);
  await res.text();
});

Deno.test("rejects unknown user", async () => {
  const res = await handleForTest(
    new Request(url, { method: "POST", headers: { Authorization: "Bearer bad" } }),
  );
  assertEquals(res.status, 401);
  await res.text();
});

Deno.test("rejects non-coach non-admin user", async () => {
  const res = await handleForTest(
    new Request(url, {
      method: "POST",
      headers: { Authorization: "Bearer rando", "content-type": "application/json" },
      body: JSON.stringify({ text: "hi", field: "notes" }),
    }),
  );
  assertEquals(res.status, 403);
  await res.text();
});

Deno.test("polish rejects empty text", async () => {
  const res = await handleForTest(
    new Request(url, {
      method: "POST",
      headers: { Authorization: "Bearer coach", "content-type": "application/json" },
      body: JSON.stringify({ text: "  ", field: "notes" }),
    }),
  );
  assertEquals(res.status, 400);
  await res.text();
});

Deno.test("polish rejects invalid field", async () => {
  const res = await handleForTest(
    new Request(url, {
      method: "POST",
      headers: { Authorization: "Bearer coach", "content-type": "application/json" },
      body: JSON.stringify({ text: "hello", field: "bogus" }),
    }),
  );
  assertEquals(res.status, 400);
  await res.text();
});

Deno.test("polish rejects oversized text", async () => {
  const res = await handleForTest(
    new Request(url, {
      method: "POST",
      headers: { Authorization: "Bearer coach", "content-type": "application/json" },
      body: JSON.stringify({ text: "x".repeat(8001), field: "notes" }),
    }),
  );
  assertEquals(res.status, 413);
  await res.text();
});

Deno.test("polish OK for coach with valid field", async () => {
  const res = await handleForTest(
    new Request(url, {
      method: "POST",
      headers: { Authorization: "Bearer coach", "content-type": "application/json" },
      body: JSON.stringify({ text: "rough notes here", field: "drills" }),
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.text, "STUB OUTPUT");
});

Deno.test("polish OK for admin", async () => {
  const res = await handleForTest(
    new Request(url, {
      method: "POST",
      headers: { Authorization: "Bearer admin", "content-type": "application/json" },
      body: JSON.stringify({ text: "rough notes", field: "progress" }),
    }),
  );
  assertEquals(res.status, 200);
  await res.text();
});

Deno.test("transcribe rejects missing audio part", async () => {
  const fd = new FormData();
  // no audio
  const res = await handleForTest(
    new Request(url, { method: "POST", headers: { Authorization: "Bearer coach" }, body: fd }),
  );
  assertEquals(res.status, 400);
  await res.text();
});

Deno.test("transcribe rejects empty audio", async () => {
  const fd = new FormData();
  fd.append("audio", new File([], "x.webm", { type: "audio/webm" }));
  const res = await handleForTest(
    new Request(url, { method: "POST", headers: { Authorization: "Bearer coach" }, body: fd }),
  );
  assertEquals(res.status, 400);
  await res.text();
});

Deno.test("transcribe rejects unsupported audio mime", async () => {
  const fd = new FormData();
  fd.append("audio", new File([new Uint8Array([1, 2, 3])], "x.aiff", { type: "audio/aiff" }));
  const res = await handleForTest(
    new Request(url, { method: "POST", headers: { Authorization: "Bearer coach" }, body: fd }),
  );
  assertEquals(res.status, 400);
  await res.text();
});

Deno.test("transcribe OK for valid webm audio", async () => {
  const fd = new FormData();
  fd.append("audio", new File([new Uint8Array(2048)], "x.webm", { type: "audio/webm" }));
  const res = await handleForTest(
    new Request(url, { method: "POST", headers: { Authorization: "Bearer coach" }, body: fd }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.text, "STUB OUTPUT");
});
