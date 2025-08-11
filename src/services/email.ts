import { supabase } from "../config/supabase";
import { SUPABASE_URL } from "../config/env";

export interface EmailRequest {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  type?: "password_reset" | "general";
}

export interface EmailResponse {
  success: boolean;
  id?: string;
  error?: string;
  details?: string;
}

interface BrandEmailParams {
  title: string;
  intro?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function renderBrandEmail({
  title,
  intro,
  bodyHtml,
  ctaLabel,
  ctaHref,
}: BrandEmailParams) {
  const button =
    ctaLabel && ctaHref
      ? `<div style="text-align:center;margin:32px 0;">
        <a href="${ctaHref}" style="background-color:#7CB342;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">${ctaLabel}</a>
      </div>`
      : "";

  const introHtml = intro ? `<p style="margin-top:0;">${intro}</p>` : "";

  return `
    <div style="font-family:Arial,sans-serif;background-color:#F7F9FC;padding:24px;">
      <div style="max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
        <div style="background-color:#1E4A74;color:#FFFFFF;padding:24px;text-align:center;">
          <h1 style="margin:0;font-size:24px;">Hadirot</h1>
        </div>
        <div style="padding:24px;color:#374151;font-size:16px;line-height:1.5;">
          <h2 style="margin:0 0 16px 0;font-size:20px;color:#1E4A74;">${title}</h2>
          ${introHtml}
          ${bodyHtml}
          ${button}
        </div>
        <div style="background-color:#F7F9FC;color:#6B7280;text-align:center;font-size:12px;padding:16px;">
          © ${new Date().getFullYear()} Hadirot. All rights reserved.
        </div>
      </div>
    </div>
  `;
}

export const emailService = {
  async sendPasswordResetEmail(to: string): Promise<EmailResponse> {
    try {
      return await requestPasswordReset(to);
    } catch (error) {
      console.error("Error sending password reset email:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },

  async sendEmail(emailData: EmailRequest): Promise<EmailResponse> {
    try {
      if (emailData.type === "password_reset") {
        const toEmail = Array.isArray(emailData.to)
          ? emailData.to[0]
          : emailData.to;
        return await this.sendPasswordResetEmail(toEmail, emailData.subject);
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error("User must be authenticated to send emails");
      }

      headers["Authorization"] = `Bearer ${session.access_token}`;

      const functionUrl = `${SUPABASE_URL}/functions/v1/send-email`;

      const response = await fetch(functionUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(emailData),
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || "Failed to send email",
          details: result.details,
        };
      }

      return result;
    } catch (error) {
      console.error("Error sending email:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },

  // Helper function to send a simple text email
  async sendSimpleEmail(
    to: string | string[],
    subject: string,
    message: string,
  ): Promise<EmailResponse> {
    const html = renderBrandEmail({
      title: subject,
      bodyHtml: `<p>${message.replace(/\n/g, "<br>")}</p>`,
    });

    return this.sendEmail({ to, subject, html });
  },

  // Helper function to send a notification email to admins
  async sendAdminNotification(
    subject: string,
    message: string,
  ): Promise<EmailResponse> {
    // You can configure admin email addresses here or fetch from database
    const adminEmails = ["admin@hadirot.com"]; // Replace with actual admin emails

    return this.sendSimpleEmail(
      adminEmails,
      `[HaDirot Admin] ${subject}`,
      message,
    );
  },

  async sendWelcomeEmail({
    to,
    fullName,
  }: {
    to: string;
    fullName: string;
  }): Promise<EmailResponse> {
    const html = renderBrandEmail({
      title: "Welcome to Hadirot",
      intro: `Hi ${fullName},`,
      bodyHtml:
        "<p>Thanks for joining Hadirot. We're excited to help you find your next home.</p>",
      ctaLabel: "Browse Listings",
      ctaHref: `${typeof window !== "undefined" ? window.location.origin : ""}/browse`,
    });

    return this.sendEmail({
      to,
      subject: "Welcome to Hadirot",
      html,
    });
  },

  async sendAccountDeletedEmail({
    to,
    fullName,
    reason,
  }: {
    to: string;
    fullName: string;
    reason?: string;
  }): Promise<EmailResponse> {
    const reasonText = reason ? `<p>${reason}</p>` : "";
    const html = renderBrandEmail({
      title: "Account Deleted",
      intro: `Hi ${fullName},`,
      bodyHtml: `<p>Your account has been deleted.</p>${reasonText}<p>If you have any questions, contact support@hadirot.com.</p>`,
    });

    return this.sendEmail({
      to,
      subject: "Your Hadirot account has been deleted",
      html,
    });
  },

  async sendListingUpdateEmail(
    userEmail: string,
    userName: string,
    listingTitle: string,
  ): Promise<EmailResponse> {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const html = renderBrandEmail({
      title: "Listing Updated",
      intro: `Hi ${userName},`,
      bodyHtml: `<p>Your listing "<strong>${listingTitle}</strong>" has been updated successfully on Hadirot.</p>`,
      ctaLabel: "View My Dashboard",
      ctaHref: `${origin}/dashboard`,
    });
    return this.sendEmail({
      to: userEmail,
      subject: `Listing Updated: ${listingTitle} - Hadirot`,
      html,
    });
  },

  async sendListingDeactivationEmail(
    userEmail: string,
    userName: string,
    listingTitle: string,
  ): Promise<EmailResponse> {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const html = renderBrandEmail({
      title: "Listing Deactivated",
      intro: `Hi ${userName},`,
      bodyHtml: `<p>Your listing "<strong>${listingTitle}</strong>" has been deactivated and is no longer visible to potential tenants.</p>`,
      ctaLabel: "Manage My Listings",
      ctaHref: `${origin}/dashboard`,
    });
    return this.sendEmail({
      to: userEmail,
      subject: `Listing Deactivated: ${listingTitle} - Hadirot`,
      html,
    });
  },

  async sendListingReactivationEmail(
    userEmail: string,
    userName: string,
    listingTitle: string,
  ): Promise<EmailResponse> {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const html = renderBrandEmail({
      title: "Listing Reactivated",
      intro: `Hi ${userName},`,
      bodyHtml: `<p>Your listing "<strong>${listingTitle}</strong>" has been reactivated and is visible again.</p>`,
      ctaLabel: "View My Dashboard",
      ctaHref: `${origin}/dashboard`,
    });
    return this.sendEmail({
      to: userEmail,
      subject: `Listing Reactivated: ${listingTitle} - Hadirot`,
      html,
    });
  },

  async sendListingApprovalEmail(
    userEmail: string,
    userName: string,
    listingTitle: string,
    listingId: string,
  ): Promise<EmailResponse> {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const html = renderBrandEmail({
      title: "Listing Approved",
      intro: `Hi ${userName},`,
      bodyHtml: `<p>Your listing "<strong>${listingTitle}</strong>" has been approved and is now live on Hadirot.</p>`,
      ctaLabel: "View Live Listing",
      ctaHref: `${origin}/listing/${listingId}`,
    });
    return this.sendEmail({
      to: userEmail,
      subject: `Listing Approved: ${listingTitle} is now live! - Hadirot`,
      html,
    });
  },

  async sendListingFeaturedEmail(
    userEmail: string,
    userName: string,
    listingTitle: string,
    isFeatured: boolean,
  ): Promise<EmailResponse> {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const html = renderBrandEmail({
      title: isFeatured ? "Listing Featured" : "Featured Status Removed",
      intro: `Hi ${userName},`,
      bodyHtml: isFeatured
        ? `<p>Your listing "<strong>${listingTitle}</strong>" is now featured on Hadirot!</p>`
        : `<p>The featured status has been removed from your listing "<strong>${listingTitle}</strong>".</p>`,
      ctaLabel: "View My Dashboard",
      ctaHref: `${origin}/dashboard`,
    });
    return this.sendEmail({
      to: userEmail,
      subject: `${isFeatured ? "Listing Featured" : "Featured Status Removed"}: ${listingTitle} - Hadirot`,
      html,
    });
  },

  // Helper function to send permission changed email
  async sendPermissionChangedEmail(
    userEmail: string,
    userName: string,
    newLimit: number,
    previousLimit?: number,
  ): Promise<EmailResponse> {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const body =
      newLimit > 0
        ? `<p>You can now feature up to <strong>${newLimit}</strong> listing${newLimit === 1 ? "" : "s"} at a time.</p>`
        : "<p>You no longer have access to feature listings.</p>";
    const prev =
      previousLimit !== undefined
        ? `<p>Previous limit: ${previousLimit}</p>`
        : "";
    const html = renderBrandEmail({
      title: "Account Permissions Updated",
      intro: `Hi ${userName},`,
      bodyHtml: `${body}${prev}`,
      ctaLabel: "View My Dashboard",
      ctaHref: `${origin}/dashboard`,
    });
    return this.sendEmail({
      to: userEmail,
      subject: "Account Permissions Updated - Hadirot",
      html,
    });
  },

  async sendListingDeletedEmail(
    userEmail: string,
    userName: string,
    listingTitle: string,
  ): Promise<EmailResponse> {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const html = renderBrandEmail({
      title: "Listing Deleted",
      intro: `Hi ${userName},`,
      bodyHtml: `<p>Your listing "<strong>${listingTitle}</strong>" has been permanently deleted from Hadirot.</p>`,
      ctaLabel: "View My Dashboard",
      ctaHref: `${origin}/dashboard`,
    });
    return this.sendEmail({
      to: userEmail,
      subject: `Listing Deleted: ${listingTitle} - Hadirot`,
      html,
    });
  },

  async sendListingUpdatedEmail(
    userEmail: string,
    userName: string,
    listingTitle: string,
  ): Promise<EmailResponse> {
    return this.sendListingUpdateEmail(userEmail, userName, listingTitle);
  },
};

export async function requestPasswordReset(
  email: string,
  redirectUrl?: string,
) {
  const endpoint =
    "https://pxlxdlrjmrkxyygdhvku.functions.supabase.co/send-password-reset";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: email, redirectUrl }), // NOTE: 'to', not 'email'
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) {
    const msg = json?.message || `HTTP ${res.status}`;
    throw new Error(`Password reset failed: ${msg}`);
  }
  return true;
}
