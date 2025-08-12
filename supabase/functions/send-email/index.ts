// supabase/functions/send-email/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { sendViaZepto, renderBrandEmail } from "../_shared/zepto.ts";

type Body =
  | {
      to: string | string[];
      subject: string;
      html: string;          // direct HTML (preferred)
      from?: string;
      fromName?: string;
    }
  | {
      // templated path if callers prefer:
      to: string | string[];
      from?: string;
      fromName?: string;
      template: {
        title: string;
        intro?: string;
        bodyHtml: string;
        ctaLabel?: string;
        ctaHref?: string;
        footerNote?: string;
      };
      subject: string;
    };

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Body;

    const html =
      "template" in body
        ? renderBrandEmail(body.template)
        : body.html;

    const result = await sendViaZepto({
      to: body.to,
      subject: body.subject,
      html,
      from: "from" in body ? body.from : undefined,
      fromName: "fromName" in body ? body.fromName : undefined,
    });

    return new Response(JSON.stringify({ ok: true, provider: "zepto", result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
