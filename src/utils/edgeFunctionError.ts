/**
 * supabase-js reports any non-2xx from an edge function as a FunctionsHttpError
 * whose `.message` is the useless "Edge Function returned a non-2xx status
 * code" — the server's actual explanation sits unread on `.context`, the raw
 * Response. Callers that surface `error.message` therefore show the user
 * nothing, and any caller that retries on transient errors can never match
 * "overloaded"/"429"/etc. because those words never reach it.
 */

/** Pull the JSON body off a supabase-js FunctionsHttpError (non-2xx responses).
 *  Returns null if the error isn't an HTTP error or the body isn't JSON. */
export async function readFunctionErrorBody(
  error: unknown,
): Promise<{ error?: string; message?: string } | null> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      return await (ctx as Response).clone().json();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The server's own message for a failed `functions.invoke`, falling back to the
 * generic supabase-js text when the function returned no JSON body.
 */
export async function edgeFunctionErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  const body = await readFunctionErrorBody(error);
  const serverMessage = body?.error || body?.message;
  if (serverMessage) return serverMessage;
  const generic = (error as { message?: string })?.message;
  return generic || fallback;
}
