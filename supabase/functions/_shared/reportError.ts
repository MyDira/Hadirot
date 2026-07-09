// Minimal Sentry error reporter for Supabase Edge Functions (Deno runtime).
//
// Posts directly to Sentry's envelope ingest endpoint via a plain `fetch` —
// deliberately avoids pulling in `@sentry/deno` (a much larger dependency)
// for what is just a fire-and-forget error report from a handful of
// money-adjacent / cron edge functions.
//
// Configure by setting the SENTRY_DSN secret on the Supabase project
// (Dashboard > Edge Functions > Secrets, or `supabase secrets set`). This can
// be the same DSN used by the client (src/main.tsx) or a dedicated
// server-side Sentry project/DSN — either works, since a DSN's public key
// only ever authorizes *sending* events, never reading them.
//
// If SENTRY_DSN is unset, every call below becomes a silent no-op so local
// development and any function that doesn't have the secret configured yet
// never breaks because of this helper.

interface ReportErrorOptions {
  /** Name of the edge function reporting the error, e.g. "delete-user". */
  functionName: string;
  /** Extra structured context to attach to the Sentry event. */
  extra?: Record<string, unknown>;
  /** Extra searchable tags (in addition to `function`). */
  tags?: Record<string, string>;
}

interface ParsedDsn {
  host: string;
  projectId: string;
  publicKey: string;
}

function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    if (!publicKey || !projectId || !url.host) return null;
    return { host: url.host, projectId, publicKey };
  } catch {
    return null;
  }
}

function generateEventId(): string {
  // Sentry expects a 32-char hex id with no dashes.
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Best-effort report of an error to Sentry from an edge function's top-level
 * catch block. Never throws — a Sentry outage, a malformed DSN, or a network
 * hiccup here must never affect the function's own error response.
 *
 * Usage:
 *   } catch (error) {
 *     console.error("my-function error:", error);
 *     await reportError(error, { functionName: "my-function" });
 *     return new Response(...);
 *   }
 */
export async function reportError(
  error: unknown,
  options: ReportErrorOptions,
): Promise<void> {
  try {
    const dsn = Deno.env.get("SENTRY_DSN");
    if (!dsn) {
      // Not configured — console.error in the caller's own catch block still
      // captures this in Supabase's function logs.
      return;
    }

    const parsed = parseDsn(dsn);
    if (!parsed) {
      console.error("reportError: SENTRY_DSN is malformed, skipping Sentry report");
      return;
    }

    const err = error instanceof Error ? error : new Error(String(error));
    const eventId = generateEventId();
    const timestamp = new Date().toISOString();

    const envelopeHeader = JSON.stringify({
      event_id: eventId,
      sent_at: timestamp,
      dsn,
    });

    const itemHeader = JSON.stringify({ type: "event" });

    const eventBody = JSON.stringify({
      event_id: eventId,
      timestamp,
      platform: "other",
      level: "error",
      logger: "supabase-edge-function",
      environment: Deno.env.get("SENTRY_ENVIRONMENT") || "production",
      server_name: options.functionName,
      tags: { function: options.functionName, ...(options.tags || {}) },
      extra: { ...(options.extra || {}), stack: err.stack || null },
      exception: {
        values: [
          {
            type: err.name || "Error",
            value: err.message || String(error),
          },
        ],
      },
    });

    const envelope = `${envelopeHeader}\n${itemHeader}\n${eventBody}\n`;

    const ingestUrl =
      `https://${parsed.host}/api/${parsed.projectId}/envelope/` +
      `?sentry_key=${parsed.publicKey}&sentry_version=7&sentry_client=hadirot-edge-function/1.0`;

    await fetch(ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
    });
  } catch (reportingError) {
    // Reporting itself must never throw into the caller.
    console.error("reportError: failed to send error to Sentry:", reportingError);
  }
}
