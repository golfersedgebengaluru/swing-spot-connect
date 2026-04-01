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
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verify JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check admin role
    const { data: isAdmin } = await supabase.rpc('is_admin_or_site_admin', { _user_id: user.id })
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const imageUrl = formData.get('image_url') as string | null

    if (!file && !imageUrl) {
      return new Response(JSON.stringify({ error: 'No file or image URL provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let imageContent: any

    if (file) {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
      const mimeType = file.type || 'image/jpeg'
      imageContent = {
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${base64}` }
      }
    } else if (imageUrl) {
      imageContent = {
        type: 'image_url',
        image_url: { url: imageUrl }
      }
    }

    const systemPrompt = `You are a bill/invoice data extraction assistant. Extract data from the uploaded bill/invoice image and return a structured JSON response.

Extract:
- vendor_name: The seller/vendor business name
- vendor_gstin: The seller's GSTIN if visible (15-character alphanumeric)
- vendor_contact: Any contact details visible (phone, email, address)
- bill_date: Date on the bill (YYYY-MM-DD format)
- bill_number: Invoice/bill number if visible
- line_items: Array of items with:
  - name: Item/service name
  - quantity: Quantity (number)
  - unit_price: Price per unit (number, excluding GST)
  - hsn_code: HSN code if visible
  - sac_code: SAC code if visible  
  - gst_rate: GST percentage (number, e.g. 18)
  - amount: Total amount for this line (number, excluding GST)
- subtotal: Sum before GST (number)
- cgst_amount: CGST amount if shown (number)
- sgst_amount: SGST amount if shown (number)  
- igst_amount: IGST amount if shown (number)
- total: Grand total including GST (number)
- suggested_category: Best matching category from: Staff & Payroll, Utilities, Maintenance & Repairs, Consumables & Supplies, Marketing, Misc, Other

Return ONLY valid JSON, no markdown or explanation.`

    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract all data from this bill/invoice image. Return structured JSON only.' },
              imageContent
            ]
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 4096,
      }),
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      console.error('AI Gateway error:', errText)
      return new Response(JSON.stringify({ error: 'Failed to process bill image' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const aiResult = await aiResponse.json()
    const content = aiResult.choices?.[0]?.message?.content

    if (!content) {
      return new Response(JSON.stringify({ error: 'No data extracted from bill' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      // Try extracting JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1])
      } else {
        return new Response(JSON.stringify({ error: 'Could not parse AI response', raw: content }), {
          status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    return new Response(JSON.stringify({ data: parsed }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('scan-bill error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
