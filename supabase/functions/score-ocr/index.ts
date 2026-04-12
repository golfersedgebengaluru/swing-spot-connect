import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { image_base64, image_url, league_id } = body

    if (!image_base64 && !image_url) {
      return new Response(JSON.stringify({ error: 'image_base64 or image_url required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build image content for vision model
    const imageContent = image_base64
      ? { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image_base64}` } }
      : { type: 'image_url', image_url: { url: image_url } }

    const systemPrompt = `You are a golf scorecard OCR assistant. Extract scores from the scorecard image.
Return a JSON object with this exact structure:
{
  "holes": [
    { "hole": 1, "par": 4, "score": 5 },
    { "hole": 2, "par": 3, "score": 3 }
  ],
  "total_par": 72,
  "total_score": 78,
  "player_name": "if visible on card",
  "course_name": "if visible on card",
  "confidence": 0.95
}

Rules:
- Extract ALL holes visible (9 or 18)
- If a score is illegible, set it to null
- confidence is 0.0-1.0 reflecting how confident you are
- Return ONLY valid JSON, no markdown`

    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract the scores from this golf scorecard.' },
              imageContent,
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
      }),
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      console.error('AI gateway error:', errText)
      return new Response(JSON.stringify({ error: 'OCR processing failed' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const aiData = await aiResponse.json()
    const content = aiData.choices?.[0]?.message?.content

    if (!content) {
      return new Response(JSON.stringify({ error: 'No OCR result' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to parse OCR result', raw: content }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Convert holes array to flat scores array for the league score format
    const holeScores = (parsed.holes || []).map((h: any) => h.score ?? 0)
    const totalScore = parsed.total_score ?? holeScores.reduce((s: number, v: number) => s + v, 0)

    return new Response(JSON.stringify({
      hole_scores: holeScores,
      total_score: totalScore,
      total_par: parsed.total_par,
      player_name: parsed.player_name,
      course_name: parsed.course_name,
      confidence: parsed.confidence,
      raw_extraction: parsed,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('Score OCR error:', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
