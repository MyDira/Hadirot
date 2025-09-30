import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { v5 as uuidv5 } from "https://esm.sh/uuid@9";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NS = "00000000-0000-0000-0000-000000000000"; // fixed namespace

function normalizeId(s: unknown): string {
  const str = String(s ?? "");
  if (!str) return crypto.randomUUID();
  return UUID_RE.test(str) ? str : uuidv5(str, NS);
}

type InEvent = {
  session_id: string;
  anon_id: string;
  user_id?: string | null;
  event_name: string;
  event_props?: Record<string, unknown>;
  occurred_at?: string;
};

type NormalizedEvent = {
  session_id: string;
  anon_id: string;
  user_id: string | null;
  event_name: string;
  event_props: Record<string, unknown>;
  occurred_at: string;
  ua: string | null;
  ip_hash: string | null;
};

const MAX_BATCH_SIZE = 50;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function parseBody(req: Request): Promise<unknown> {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType || contentType.includes('text/plain')) {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text);
  }
  return req.json();
}

function coerceEvents(payload: unknown): InEvent[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as InEvent[];
  if (typeof payload === 'object' && payload !== null) {
    const maybeEvents = (payload as { events?: unknown }).events;
    if (Array.isArray(maybeEvents)) {
      return maybeEvents as InEvent[];
    }
    return [payload as InEvent];
  }
  return [];
}

function getClientIP(req: Request): string | null {
  const headers = [
    'x-forwarded-for',
    'x-real-ip',
    'cf-connecting-ip',
    'x-client-ip',
    'x-forwarded',
    'forwarded-for',
    'forwarded',
  ];

  for (const header of headers) {
    const value = req.headers.get(header);
    if (value) {
      const ip = value.split(',')[0]?.trim();
      if (ip) return ip;
    }
  }

  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function sanitizeEventProps(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, unknown>;
}

function toIsoTimestamp(value: string | undefined, fallbackIso: string): string {
  if (!value) return fallbackIso;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallbackIso;
  }
  return parsed.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const body = await parseBody(req);
    const events = coerceEvents(body);

    if (!events.length) {
      return jsonResponse(400, { error: 'No events provided' });
    }

    if (events.length > MAX_BATCH_SIZE) {
      return jsonResponse(400, { error: `Too many events (max ${MAX_BATCH_SIZE})` });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(500, { error: 'Server not configured' });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const userAgent = req.headers.get('user-agent');
    const clientIp = getClientIP(req);
    const ipHash = clientIp ? await sha256Hex(clientIp) : null;
    const fallbackIso = new Date().toISOString();

    const normalizedEvents: NormalizedEvent[] = [];
    const sessionTouches = new Map<string, { anon: string; user: string | null; last: string }>();
    const sessionEnds = new Map<string, string>();
    const debugAnalytics = Deno.env.get('DEBUG_ANALYTICS') === '1';

    for (const event of events) {
      const rawSessionId = typeof event.session_id === 'string' ? event.session_id : null;
      const rawAnonId = typeof event.anon_id === 'string' ? event.anon_id : null;
      const eventName = typeof event.event_name === 'string' ? event.event_name : null;

      if (!rawSessionId || !rawAnonId || !eventName) {
        return jsonResponse(400, { error: 'Event missing required fields' });
      }

      // Normalize IDs to proper UUIDs
      const sessionId = normalizeId(rawSessionId);
      const anonId = normalizeId(rawAnonId);
      
      if (debugAnalytics && (rawSessionId !== sessionId || rawAnonId !== anonId)) {
        console.log('[DEBUG] ID normalization:', {
          rawSession: rawSessionId,
          normalizedSession: sessionId,
          rawAnon: rawAnonId,
          normalizedAnon: anonId
        });
      }

      const occurredAt = toIsoTimestamp(event.occurred_at, fallbackIso);
      const userId = typeof event.user_id === 'string' ? event.user_id : null;
      const eventProps = sanitizeEventProps(event.event_props);

      const normalized: NormalizedEvent = {
        session_id: sessionId,
        anon_id: anonId,
        user_id: userId,
        event_name: eventName,
        event_props: eventProps,
        occurred_at: occurredAt,
        ua: userAgent,
        ip_hash: ipHash,
      };

      normalizedEvents.push(normalized);

      const touch = sessionTouches.get(sessionId);
      if (!touch || touch.last < occurredAt) {
        sessionTouches.set(sessionId, { anon: anonId, user: userId, last: occurredAt });
      }

      if (eventName === 'session_end') {
        const existing = sessionEnds.get(sessionId);
        if (!existing || existing < occurredAt) {
          sessionEnds.set(sessionId, occurredAt);
        }
      }
    }

    const { error } = await supabaseAdmin.from('analytics_events').insert(normalizedEvents);

    if (error) {
      console.error('Failed to insert analytics events', error);
      return jsonResponse(500, { error: 'Failed to record analytics events' });
    }

    await Promise.all(
      Array.from(sessionTouches.entries()).map(async ([sessionId, payload]) => {
        try {
          await supabaseAdmin.rpc('touch_session', {
            p_session: normalizeId(sessionId),
            p_anon: normalizeId(payload.anon),
            p_user: payload.user ? normalizeId(payload.user) : null,
            p_ts: payload.last,
          });
        } catch (touchError) {
          console.error('touch_session failed', touchError);
        }
      }),
    );

    await Promise.all(
      Array.from(sessionEnds.entries()).map(async ([sessionId, occurredAt]) => {
        try {
          await supabaseAdmin.rpc('close_session', {
            p_session: normalizeId(sessionId),
            p_ts: occurredAt,
          });
        } catch (closeError) {
          console.error('close_session failed', closeError);
        }
      }),
    );

    return jsonResponse(200, { success: true, inserted: normalizedEvents.length });
  } catch (error) {
    console.error('Track handler failure', error);
    return jsonResponse(500, { error: 'Unhandled analytics error' });
  }
});
