import { supabase } from "../config/supabase";

export interface EmailRequest {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  type?: "password_reset" | "general" | "admin_notification";
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
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: emailData,
      });

      if (error) {
        return {
          success: false,
          error: error.message || "Failed to send email",
          details: error instanceof Error ? undefined : String(error),
        };
      }

      return data as EmailResponse;
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

  async sendListingRentedReport(
    listingDetails: {
      id: string;
      title: string;
      location: string;
      neighborhood: string;
      price: number | null;
      call_for_price?: boolean;
      bedrooms: number;
      bathrooms: number;
      property_type: string;
      contact_name: string;
      contact_phone: string;
      created_at: string;
    },
    reporterInfo: {
      name: string;
      email: string;
      notes?: string;
    },
  ): Promise<EmailResponse> {
    console.log("[Email Service] Preparing to send listing rented report", {
      listingId: listingDetails.id,
      listingTitle: listingDetails.title,
      reporterName: reporterInfo.name,
      reporterEmail: reporterInfo.email,
    });
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const listingUrl = `${origin}/listing/${listingDetails.id}`;
    const adminPanelUrl = `${origin}/admin`;

    const priceText = listingDetails.call_for_price
      ? "Call for Price"
      : listingDetails.price
        ? `$${listingDetails.price.toLocaleString()}/month`
        : "Not specified";

    const propertyTypeLabels: Record<string, string> = {
      apartment_building: "Apartment in Building",
      apartment_house: "Apartment in House",
      duplex: "Duplex",
      full_house: "Full House",
    };
    const propertyTypeText = propertyTypeLabels[listingDetails.property_type] || listingDetails.property_type;

    const notesSection = reporterInfo.notes
      ? `<div style="margin:16px 0;padding:12px;background-color:#FEF3C7;border-left:4px solid #F59E0B;border-radius:4px;">
          <strong>Reporter Notes:</strong>
          <p style="margin:8px 0 0 0;">${reporterInfo.notes.replace(/\n/g, "<br>")}</p>
        </div>`
      : "";

    const bodyHtml = `
      <p style="margin-top:0;">A user has reported that the following listing is no longer available (already rented):</p>

      <div style="margin:20px 0;padding:16px;background-color:#F3F4F6;border-radius:8px;">
        <h3 style="margin:0 0 12px 0;color:#1E4A74;">${listingDetails.title}</h3>

        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;color:#6B7280;width:40%;"><strong>Location:</strong></td>
            <td style="padding:6px 0;">${listingDetails.location}, ${listingDetails.neighborhood}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6B7280;"><strong>Price:</strong></td>
            <td style="padding:6px 0;">${priceText}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6B7280;"><strong>Bedrooms:</strong></td>
            <td style="padding:6px 0;">${listingDetails.bedrooms === 0 ? "Studio" : listingDetails.bedrooms}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6B7280;"><strong>Bathrooms:</strong></td>
            <td style="padding:6px 0;">${listingDetails.bathrooms}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6B7280;"><strong>Property Type:</strong></td>
            <td style="padding:6px 0;">${propertyTypeText}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6B7280;"><strong>Contact Name:</strong></td>
            <td style="padding:6px 0;">${listingDetails.contact_name}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6B7280;"><strong>Contact Phone:</strong></td>
            <td style="padding:6px 0;">${listingDetails.contact_phone}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6B7280;"><strong>Posted Date:</strong></td>
            <td style="padding:6px 0;">${new Date(listingDetails.created_at).toLocaleDateString()}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6B7280;"><strong>Listing ID:</strong></td>
            <td style="padding:6px 0;font-family:monospace;font-size:12px;">${listingDetails.id}</td>
          </tr>
        </table>
      </div>

      ${notesSection}

      <div style="margin:20px 0;padding:16px;background-color:#EEF2FF;border-radius:8px;">
        <strong>Reported by:</strong>
        <p style="margin:8px 0 0 0;">${reporterInfo.name}<br>${reporterInfo.email}</p>
      </div>

      <p style="margin-top:20px;">
        <a href="${listingUrl}" style="color:#1E4A74;text-decoration:underline;">View Listing</a> |
        <a href="${adminPanelUrl}" style="color:#1E4A74;text-decoration:underline;">Go to Admin Panel</a>
      </p>

      <p style="margin-top:20px;font-size:14px;color:#6B7280;">
        You can find this listing in the admin panel using the listing ID or by searching for the title/contact name.
      </p>
    `;

    const html = renderBrandEmail({
      title: "Listing Reported as Rented",
      bodyHtml,
    });

    console.log("[Email Service] Sending admin notification email");
    console.log("[Email Service] Subject:", `[HaDirot Admin] Listing Reported as Rented: ${listingDetails.title}`);

    const result = await this.sendEmail({
      to: "admin@hadirot.com",
      subject: `[HaDirot Admin] Listing Reported as Rented: ${listingDetails.title}`,
      html,
      type: "admin_notification",
    });

    console.log("[Email Service] Email send result:", result);
    return result;
  },
};

export async function requestPasswordReset(
  email: string,
  redirectUrl?: string,
) {
  const { data, error } = await supabase.functions.invoke(
    "send-password-reset",
    {
      body: { to: email, redirectUrl },
    },
  );

  if (error || !data?.success) {
    const msg = error?.message || data?.error || "Unknown error";
    throw new Error(`Password reset failed: ${msg}`);
  }
  return true;
}
