import { corsHeaders } from "../_shared/cors.ts";
import { renderBrandEmail, sendViaZepto } from "../_shared/zepto.ts";

interface ContactFormData {
  name: string;
  email: string;
  phone?: string;
  message: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const zeptoToken = Deno.env.get("ZEPTO_TOKEN");
    const zeptoFromAddress = Deno.env.get("ZEPTO_FROM_ADDRESS") || "noreply@hadirot.com";
    const zeptoFromName = Deno.env.get("ZEPTO_FROM_NAME") || "HaDirot Contact Form";
    const contactRecipient = "aharon@hadirot.com";

    if (!zeptoToken) {
      console.error("ZEPTO_TOKEN not found");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let formData: ContactFormData;
    try {
      formData = await req.json();
      console.log("Contact form submission:", {
        name: formData.name,
        email: formData.email,
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!formData.name || !formData.email || !formData.message) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const escapeHtml = (text: string) => {
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    const safeName = escapeHtml(formData.name);
    const safeEmail = escapeHtml(formData.email);
    const safePhone = formData.phone ? escapeHtml(formData.phone) : null;
    const safeMessage = escapeHtml(formData.message).replace(/\n/g, "<br>");

    const emailHtml = renderBrandEmail({
      title: "New Contact Form Submission",
      bodyHtml: `
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="color: #273140; margin-top: 0; margin-bottom: 16px; font-size: 18px;">Contact Details</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4b5563; width: 100px;">Name:</td>
              <td style="padding: 8px 0; color: #1f2937;">${safeName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4b5563;">Email:</td>
              <td style="padding: 8px 0; color: #1f2937;"><a href="mailto:${safeEmail}" style="color: #273140; text-decoration: underline;">${safeEmail}</a></td>
            </tr>
            ${safePhone ? `
            <tr>
              <td style="padding: 8px 0; font-weight: 600; color: #4b5563;">Phone:</td>
              <td style="padding: 8px 0; color: #1f2937;"><a href="tel:${safePhone}" style="color: #273140; text-decoration: none;">${safePhone}</a></td>
            </tr>
            ` : ''}
          </table>
        </div>
        <div style="margin: 20px 0;">
          <h2 style="color: #273140; margin-top: 0; margin-bottom: 12px; font-size: 18px;">Message</h2>
          <div style="background-color: #ffffff; border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px; color: #1f2937; line-height: 1.6;">
            ${safeMessage}
          </div>
        </div>
        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
          <p style="margin: 0;">Sent via HaDirot contact form.</p>
          <p style="margin: 8px 0 0 0;">Reply to <a href="mailto:${safeEmail}" style="color: #273140;">${safeEmail}</a></p>
        </div>
      `,
      ctaLabel: null,
      ctaHref: null,
    });

    console.log("Sending email to:", contactRecipient);

    try {
      await sendViaZepto({
        to: [contactRecipient],
        subject: `New Contact Form Message from ${safeName}`,
        html: emailHtml,
        from: zeptoFromAddress,
        fromName: zeptoFromName,
        replyTo: formData.email,
      });

      console.log("Email sent successfully");

      return new Response(
        JSON.stringify({
          success: true,
          message: "Message sent!",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Error sending email:", error);

      return new Response(
        JSON.stringify({ error: "Failed to send message" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("Error:", error);

    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});