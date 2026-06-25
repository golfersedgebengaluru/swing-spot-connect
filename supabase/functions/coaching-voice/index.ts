// Coaching voice helper — uses Google Gemini API directly (not Lovable AI).
// Two actions:
//   - transcribe: multipart/form-data with `audio` file → { text }
//   - polish:     JSON { text, field } → { text } (cleaned/structured)
//
// Auth: requires authenticated user with role 'coach', 'admin', or 'site_admin'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_TEXT_CHARS = 8000;
const ALLOWED_AUDIO = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/x-m4a",
  "audio/m4a",
]);

type Field = "notes" | "drills" | "progress";

const POLISH_PROMPTS: Record<Field, string> = {
  notes:
    "You are cleaning up a golf coach's spoken notes from a 1:1 lesson. Keep the coach's exact meaning. Fix grammar and punctuation. Format as short, scannable bullet points grouped by topic when natural. Do NOT invent details, drills, or numbers that were not spoken. Output only the cleaned notes, no preamble.",
  drills:
    "You are cleaning up a golf coach's spoken list of drills assigned to a student. Format as a numbered list. For each drill, keep any sets/reps/duration the coach mentioned. Do NOT invent reps, sets, or drills that were not spoken. Output only the numbered list, no preamble.",
  progress:
    "You are cleaning up a golf coach's spoken progress summary for a student. Rewrite as 2-3 concise sentences suitable for the student to read on a session card. Keep the coach's exact assessment. Do NOT invent improvements or metrics not spoken. Output only the summary, no preamble.",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Chunked base64 encode for large binary inputs (avoids stack overflow on btoa(String.fromCharCode(...big array))).
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function callGemini(apiKey: string, body: unknown): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any)?.error?.message || `Gemini error ${res.status}`;
    throw new Error(msg);
  }
  const text =
    (data as any)?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text ?? "")
      .join("")
      .trim() ?? "";
  return text;
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) return json({ error: "Voice service not configured" }, 500);

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  // Allow coaches, admins, site admins
  const [{ data: isCoach }, { data: isAdminOrSA }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: user.id, _role: "coach" }),
    supabase.rpc("is_admin_or_site_admin", { _user_id: user.id }),
  ]);
  if (!isCoach && !isAdminOrSA) return json({ error: "Forbidden" }, 403);

  const ct = req.headers.get("content-type") || "";

  try {
    if (ct.includes("multipart/form-data")) {
      // Transcribe
      const form = await req.formData();
      const file = form.get("audio");
      if (!(file instanceof File)) return json({ error: "Missing 'audio' file" }, 400);
      if (file.size === 0) return json({ error: "Empty audio file" }, 400);
      if (file.size > MAX_AUDIO_BYTES) return json({ error: "Audio exceeds 15 MB limit" }, 413);
      const mime = (file.type || "audio/webm").split(";")[0];
      if (!ALLOWED_AUDIO.has(mime)) return json({ error: `Unsupported audio type: ${mime}` }, 400);

      const b64 = toBase64(await file.arrayBuffer());
      const text = await callGemini(GEMINI_API_KEY, {
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  "Transcribe the following audio verbatim in the spoken language. Output ONLY the transcription, no commentary, no quotes, no preamble.",
              },
              { inline_data: { mime_type: mime, data: b64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      });
      return json({ text });
    }

    // Polish
    const body = await req.json().catch(() => ({}));
    const rawText = typeof body?.text === "string" ? body.text : "";
    const field = body?.field as Field | undefined;
    if (!rawText.trim()) return json({ error: "Missing text" }, 400);
    if (rawText.length > MAX_TEXT_CHARS) return json({ error: "Text exceeds 8000 char limit" }, 413);
    if (!field || !(field in POLISH_PROMPTS)) return json({ error: "Invalid 'field'" }, 400);

    const cleaned = await callGemini(GEMINI_API_KEY, {
      contents: [
        {
          role: "user",
          parts: [{ text: `${POLISH_PROMPTS[field]}\n\nRaw transcript:\n"""\n${rawText}\n"""` }],
        },
      ],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    });
    return json({ text: cleaned });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Return 200 with error payload to bypass fetch error masking (project convention).
    return json({ error: msg }, 200);
  }
}

Deno.serve(handle);
