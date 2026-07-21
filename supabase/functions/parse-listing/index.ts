// parse-listing
//
// Single-listing AI parse for the Post Listing form's "Quick Fill from Text"
// (admin-only). Takes one block of pasted listing text, runs it through the
// SAME Claude prompt + schema as the admin AI Intake pipeline
// (_shared/intake.ts → parseContent), and returns the structured fields for
// the form to populate.
//
// Unlike parse-bulk-listings, this function NEVER touches the database — it is
// a pure text → structured-fields transform. Nothing lands in scraped_listings.
// This is the replacement for the decommissioned n8n webhook the old form used.
//
// Admin-only: the caller's JWT must carry app_metadata.is_admin = true.
// Required secrets: ANTHROPIC_API_KEY

import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { corsHeaders } from '../_shared/cors.ts';
import { DEFAULT_MODEL, parseContent } from '../_shared/intake.ts';

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID().substring(0, 8);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    const model = Deno.env.get('ANTHROPIC_MODEL') || DEFAULT_MODEL;

    if (!anthropicKey) {
      console.error(`[parse-listing:${requestId}] ANTHROPIC_API_KEY not configured`);
      return json({ error: 'AI parsing is not configured (missing API key).' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // --- Admin auth ---------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authentication required' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Invalid authentication' }, 401);
    if (user.app_metadata?.is_admin !== true) {
      console.error(`[parse-listing:${requestId}] Not admin:`, user.id);
      return json({ error: 'Admin privileges required' }, 403);
    }

    // --- Validate input -----------------------------------------------------
    const body = await req.json();
    const text: string = typeof body?.text === 'string' ? body.text : '';
    if (!text.trim()) return json({ error: 'No listing text provided' }, 400);

    const rawHint = body?.type_hint;
    const typeHint: 'auto' | 'rental' | 'sale' =
      rawHint === 'rental' || rawHint === 'sale' ? rawHint : 'auto';

    console.log(
      `[parse-listing:${requestId}] Admin ${user.id}: parsing ${text.length} chars, hint ${typeHint}, model ${model}`,
    );

    // --- Parse (no DB writes) ----------------------------------------------
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const listings = await parseContent(anthropic, model, text, typeHint);

    if (listings.length === 0) {
      return json({ error: 'No listing could be extracted from that text.' }, 422);
    }

    console.log(
      `[parse-listing:${requestId}] Done: ${listings.length} listing(s) parsed (returning first)`,
    );

    // The form fills one listing at a time — return the first, plus the full
    // set and count in case a pasted block held more than one.
    return json({ listing: listings[0], listings, count: listings.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[parse-listing:${requestId}] Fatal:`, message);
    return json({ error: message }, 500);
  }
});
