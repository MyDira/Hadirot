import { corsHeaders } from "../_shared/cors.ts";
import { renderBrandEmail, sendViaZepto } from "../_shared/zepto.ts";

interface ContactFormData {
  name: string;
  email: string;
  phone?: string;
  message: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Only allow POST requests
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get ZeptoMail configuration from environment variables
    const zeptoToken = Deno.env.get("ZEPTO_TOKEN");
    const zeptoFromAddress = Deno.env.get("ZEPTO_FROM_ADDRESS") || "noreply@hadirot.com";
    const zeptoFromName = Deno.env.get("ZEPTO_FROM_NAME") || "HaDirot Contact Form";
    const contactRecipient = "aharon@hadirot.com";

    if (!zeptoToken) {
      console.error("ZEPTO_TOKEN not found in environment variables");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Parse the request body
    let formData: ContactFormData;
    try {
      formData = await req.json();
      console.log("📧 Contact form submission received:", {
        name: formData.name,
        email: formData.email,
        hasPhone: !!formData.phone,
        messageLength: formData.message?.length || 0,
      });
    } catch (error) {
      console.error("❌ Invalid JSON in request body:", error);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate required fields
    if (!formData.name || !formData.email || !formData.message) {
      console.error("❌ Missing required fields:", {
        name: !!formData.name,
        email: !!formData.email,
        message: !!formData.message,
      });
      return new Response(
        JSON.stringify({
          error: "Missing required fields: name, email, and message are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Sanitize inputs to prevent XSS
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

    // Create email HTML with contact form details
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
          <p style="margin: 0;">This message was sent via the HaDirot contact form.</p>
          <p style="margin: 8px 0 0 0;">Reply directly to <a href="mailto:${safeEmail}" style="color: #273140;">${safeEmail}</a> to respond.</p>
        </div>
      `,
      ctaLabel: null,
      ctaHref: null,
    });

    console.log("📤 Sending contact form email to:", contactRecipient);

    try {
      const zeptoData = await sendViaZepto({
        to: [contactRecipient],
        subject: `New Contact Form Message from ${safeName}`,
        html: emailHtml,
        from: zeptoFromAddress,
        fromName: zeptoFromName,
        replyTo: formData.email,
      });

      console.log("✅ Contact form email sent successfully:", {
        messageId: zeptoData?.data?.message_id,
        to: contactRecipient,
        from: formData.email,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Your message has been sent successfully!",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("❌ Error sending contact form email:", {
        error: error,
        message: error.message,
        stack: error.stack,
      });

      return new Response(
        JSON.stringify({ error: "Failed to send message. Please try again later." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  } catch (error) {
    console.error("❌ Unexpected error in send-contact-message function:", {
      error: error,
      message: error.message,
      stack: error.stack,
    });

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
