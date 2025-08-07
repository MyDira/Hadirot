import { supabase } from '../config/supabase';

export interface EmailRequest {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  type?: 'password_reset' | 'general';
}

export interface EmailResponse {
  success: boolean;
  id?: string;
  error?: string;
  details?: string;
}

export const emailService = {
  async sendEmail(emailData: EmailRequest): Promise<EmailResponse> {
    try {
      // Prepare headers
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Skip authorization for password reset emails
      if (emailData.type !== 'password_reset') {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          throw new Error('User must be authenticated to send emails');
        }
        
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Get the Supabase URL from environment variables
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('Supabase URL not configured');
      }

      // Construct the edge function URL
      const functionUrl = `${supabaseUrl}/functions/v1/send-email`;

      // Make the request to the edge function
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...emailData,
          from: emailData.from || 'HaDirot <noreply@hadirot.com>',
        }),
      });

      // Parse the response
      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Failed to send email',
          details: result.details,
        };
      }

      return result;
    } catch (error) {
      console.error('Error sending email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  },

  // Helper function to send a simple text email
  async sendSimpleEmail(to: string | string[], subject: string, message: string): Promise<EmailResponse> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4E4B43; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">HaDirot</h1>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 20px; border-radius: 8px;">
            <p style="color: #333; line-height: 1.6; margin: 0;">${message.replace(/\n/g, '<br>')}</p>
          </div>
        </div>
        <div style="background-color: #4E4B43; color: #E5D8C1; padding: 15px; text-align: center; font-size: 12px;">
          <p style="margin: 0;">© 2025 HaDirot. All rights reserved.</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to,
      subject,
      html,
    });
  },

  // Helper function to send a notification email to admins
  async sendAdminNotification(subject: string, message: string): Promise<EmailResponse> {
    // You can configure admin email addresses here or fetch from database
    const adminEmails = ['admin@hadirot.com']; // Replace with actual admin emails
    
    return this.sendSimpleEmail(adminEmails, `[HaDirot Admin] ${subject}`, message);
  },

  // Helper function to send a welcome email to new users
  async sendWelcomeEmail(userEmail: string, userName: string): Promise<EmailResponse> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4E4B43; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">Welcome to HaDirot!</h1>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 20px; border-radius: 8px;">
            <h2 style="color: #4E4B43; margin-top: 0;">Hello ${userName}!</h2>
            <p style="color: #333; line-height: 1.6;">
              Thank you for joining HaDirot, NYC's premier Jewish rental platform. We're excited to help you find the perfect rental home or connect with quality tenants.
            </p>
            <p style="color: #333; line-height: 1.6;">
              Here's what you can do next:
            </p>
            <ul style="color: #333; line-height: 1.6;">
              <li>Browse available listings in your preferred neighborhoods</li>
              <li>Save your favorite properties for easy access</li>
              <li>Post your own rental listings if you're a landlord or agent</li>
              <li>Connect directly with property owners and agents</li>
            </ul>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${window.location.origin}/browse" style="background-color: #4E4B43; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Start Browsing Listings
              </a>
            </div>
            <p style="color: #666; font-size: 14px; margin-bottom: 0;">
              If you have any questions, feel free to reach out to our support team.
            </p>
          </div>
        </div>
        <div style="background-color: #4E4B43; color: #E5D8C1; padding: 15px; text-align: center; font-size: 12px;">
          <p style="margin: 0;">© 2025 HaDirot. All rights reserved.</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: userEmail,
      subject: 'Welcome to HaDirot - Your NYC Rental Journey Starts Here!',
      html,
    });
  },

  // Helper function to send listing update confirmation email
  async sendListingUpdateEmail(userEmail: string, userName: string, listingTitle: string): Promise<EmailResponse> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9;">
        <div style="background-color: #4E4B43; color: white; padding: 30px; text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 10px;">
            <svg width="40" height="40" viewBox="0 0 32 32" style="color: #E5D8C1; margin-right: 10px;">
              <path d="M16 4L6 12v16h5v-8h10v8h5V12L16 4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>
              <circle cx="23" cy="8" r="1" fill="currentColor"/>
            </svg>
            <span style="font-size: 28px; font-weight: bold; color: #E5D8C1;">HaDirot</span>
          </div>
          <h1 style="margin: 0; font-size: 24px;">Listing Updated Successfully!</h1>
        </div>
        
        <div style="padding: 30px; background-color: white; margin: 0 20px;">
          <h2 style="color: #4E4B43; margin-top: 0; font-size: 20px;">Hello ${userName}!</h2>
          
          <p style="color: #333; line-height: 1.6; font-size: 16px;">
            Your listing "<strong>${listingTitle}</strong>" has been updated successfully on HaDirot.
          </p>
          
          <div style="background-color: #e8f4f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="color: #555; line-height: 1.6; margin: 0;">
              Your changes are now live and visible to potential tenants browsing HaDirot.
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${window.location.origin}/dashboard" 
               style="background-color: #4E4B43; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
              View My Dashboard
            </a>
          </div>
        </div>
        
        <div style="background-color: #4E4B43; color: #E5D8C1; padding: 20px; text-align: center; margin: 0 20px;">
          <p style="margin: 0; font-size: 14px;">
            © 2025 HaDirot. All rights reserved.<br>
            NYC's premier Jewish rental platform
          </p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: userEmail,
      subject: `Listing Updated: ${listingTitle} - HaDirot`,
      html,
    });
  },

  // Helper function to send listing deactivation email
  async sendListingDeactivationEmail(userEmail: string, userName: string, listingTitle: string): Promise<EmailResponse> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9;">
        <div style="background-color: #4E4B43; color: white; padding: 30px; text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 10px;">
            <svg width="40" height="40" viewBox="0 0 32 32" style="color: #E5D8C1; margin-right: 10px;">
              <path d="M16 4L6 12v16h5v-8h10v8h5V12L16 4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>
              <circle cx="23" cy="8" r="1" fill="currentColor"/>
            </svg>
            <span style="font-size: 28px; font-weight: bold; color: #E5D8C1;">HaDirot</span>
          </div>
          <h1 style="margin: 0; font-size: 24px;">Listing Deactivated</h1>
        </div>
        
        <div style="padding: 30px; background-color: white; margin: 0 20px;">
          <h2 style="color: #4E4B43; margin-top: 0; font-size: 20px;">Hello ${userName}!</h2>
          
          <p style="color: #333; line-height: 1.6; font-size: 16px;">
            Your listing "<strong>${listingTitle}</strong>" has been deactivated and is no longer visible to potential tenants.
          </p>
          
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="color: #856404; line-height: 1.6; margin: 0;">
              <strong>Note:</strong> You can reactivate this listing at any time from your dashboard.
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${window.location.origin}/dashboard" 
               style="background-color: #4E4B43; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
              Manage My Listings
            </a>
          </div>
        </div>
        
        <div style="background-color: #4E4B43; color: #E5D8C1; padding: 20px; text-align: center; margin: 0 20px;">
          <p style="margin: 0; font-size: 14px;">
            © 2025 HaDirot. All rights reserved.<br>
            NYC's premier Jewish rental platform
          </p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: userEmail,
      subject: `Listing Deactivated: ${listingTitle} - HaDirot`,
      html,
    });
  },

  // Helper function to send listing reactivation email
  async sendListingReactivationEmail(userEmail: string, userName: string, listingTitle: string): Promise<EmailResponse> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9;">
        <div style="background-color: #4E4B43; color: white; padding: 30px; text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 10px;">
            <svg width="40" height="40" viewBox="0 0 32 32" style="color: #E5D8C1; margin-right: 10px;">
              <path d="M16 4L6 12v16h5v-8h10v8h5V12L16 4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>
              <circle cx="23" cy="8" r="1" fill="currentColor"/>
            </svg>
            <span style="font-size: 28px; font-weight: bold; color: #E5D8C1;">HaDirot</span>
          </div>
          <h1 style="margin: 0; font-size: 24px;">Listing Reactivated!</h1>
        </div>
        
        <div style="padding: 30px; background-color: white; margin: 0 20px;">
          <h2 style="color: #4E4B43; margin-top: 0; font-size: 20px;">Hello ${userName}!</h2>
          
          <p style="color: #333; line-height: 1.6; font-size: 16px;">
            Great news! Your listing "<strong>${listingTitle}</strong>" has been reactivated and is now live on HaDirot.
          </p>
          
          <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <p style="color: #155724; line-height: 1.6; margin: 0;">
              <strong>Your listing is now visible</strong> to potential tenants browsing HaDirot.
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${window.location.origin}/dashboard" 
               style="background-color: #4E4B43; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
              View My Dashboard
            </a>
          </div>
        </div>
        
        <div style="background-color: #4E4B43; color: #E5D8C1; padding: 20px; text-align: center; margin: 0 20px;">
          <p style="margin: 0; font-size: 14px;">
            © 2025 HaDirot. All rights reserved.<br>
            NYC's premier Jewish rental platform
          </p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: userEmail,
      subject: `Listing Reactivated: ${listingTitle} - HaDirot`,
      html,
    });
  },

  // Helper function to send listing approval email
  async sendListingApprovalEmail(userEmail: string, userName: string, listingTitle: string, listingId: string): Promise<EmailResponse> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9;">
        <div style="background-color: #28a745; color: white; padding: 30px; text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 10px;">
            <svg width="40" height="40" viewBox="0 0 32 32" style="color: white; margin-right: 10px;">
              <path d="M16 4L6 12v16h5v-8h10v8h5V12L16 4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>
              <circle cx="23" cy="8" r="1" fill="currentColor"/>
            </svg>
            <span style="font-size: 28px; font-weight: bold;">HaDirot</span>
          </div>
          <h1 style="margin: 0; font-size: 24px;">🎉 Listing Approved!</h1>
        </div>
        
        <div style="padding: 30px; background-color: white; margin: 0 20px;">
          <h2 style="color: #4E4B43; margin-top: 0; font-size: 20px;">Congratulations ${userName}!</h2>
          
          <p style="color: #333; line-height: 1.6; font-size: 16px;">
            Your listing "<strong>${listingTitle}</strong>" has been approved and is now live on HaDirot!
          </p>
          
          <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <h3 style="color: #155724; margin-top: 0; font-size: 18px;">✅ Your listing is now:</h3>
            <ul style="color: #155724; line-height: 1.6; margin: 0; padding-left: 20px;">
              <li>Visible to thousands of potential tenants</li>
              <li>Searchable in our browse section</li>
              <li>Ready to receive inquiries</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${window.location.origin}/listing/${listingId}" 
               style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px; margin-right: 10px;">
              View Live Listing
            </a>
            <a href="${window.location.origin}/dashboard" 
               style="background-color: #4E4B43; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
              My Dashboard
            </a>
          </div>
          
          <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
            <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0;">
              <strong>What's next?</strong> Keep your listing updated and respond promptly to inquiries. 
              You can edit your listing details anytime from your dashboard.
            </p>
          </div>
        </div>
        
        <div style="background-color: #4E4B43; color: #E5D8C1; padding: 20px; text-align: center; margin: 0 20px;">
          <p style="margin: 0; font-size: 14px;">
            © 2025 HaDirot. All rights reserved.<br>
            NYC's premier Jewish rental platform
          </p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: userEmail,
      subject: `🎉 Listing Approved: ${listingTitle} is now live! - HaDirot`,
      html,
    });
  },

  // Helper function to send featured status change email
  async sendListingFeaturedEmail(userEmail: string, userName: string, listingTitle: string, isFeatured: boolean): Promise<EmailResponse> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9;">
        <div style="background-color: ${isFeatured ? '#D29D86' : '#4E4B43'}; color: white; padding: 30px; text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 10px;">
            <svg width="40" height="40" viewBox="0 0 32 32" style="color: white; margin-right: 10px;">
              <path d="M16 4L6 12v16h5v-8h10v8h5V12L16 4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>
              <circle cx="23" cy="8" r="1" fill="currentColor"/>
            </svg>
            <span style="font-size: 28px; font-weight: bold;">HaDirot</span>
          </div>
          <h1 style="margin: 0; font-size: 24px;">
            ${isFeatured ? '⭐ Listing Featured!' : 'Featured Status Removed'}
          </h1>
        </div>
        
        <div style="padding: 30px; background-color: white; margin: 0 20px;">
          <h2 style="color: #4E4B43; margin-top: 0; font-size: 20px;">Hello ${userName}!</h2>
          
          <p style="color: #333; line-height: 1.6; font-size: 16px;">
            ${isFeatured 
              ? `Your listing "<strong>${listingTitle}</strong>" is now featured on HaDirot!`
              : `The featured status has been removed from your listing "<strong>${listingTitle}</strong>".`
            }
          </p>
          
          <div style="background-color: ${isFeatured ? '#fff3cd' : '#f8f9fa'}; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${isFeatured ? '#D29D86' : '#6c757d'};">
            <p style="color: ${isFeatured ? '#856404' : '#495057'}; line-height: 1.6; margin: 0;">
              ${isFeatured 
                ? '<strong>Featured listings</strong> get premium placement and increased visibility to potential tenants.'
                : 'Your listing is still active and visible to potential tenants in regular search results.'
              }
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${window.location.origin}/dashboard" 
               style="background-color: #4E4B43; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
              View My Dashboard
            </a>
          </div>
        </div>
        
        <div style="background-color: #4E4B43; color: #E5D8C1; padding: 20px; text-align: center; margin: 0 20px;">
          <p style="margin: 0; font-size: 14px;">
            © 2025 HaDirot. All rights reserved.<br>
            NYC's premier Jewish rental platform
          </p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: userEmail,
      subject: `${isFeatured ? '⭐ Listing Featured' : 'Featured Status Removed'}: ${listingTitle} - HaDirot`,
      html,
    });
  },

  // Helper function to send permission changed email
  async sendPermissionChangedEmail(userEmail: string, userName: string, newLimit: number, previousLimit?: number): Promise<EmailResponse> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9;">
        <div style="background-color: #4E4B43; color: white; padding: 30px; text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 10px;">
            <svg width="40" height="40" viewBox="0 0 32 32" style="color: #E5D8C1; margin-right: 10px;">
              <path d="M16 4L6 12v16h5v-8h10v8h5V12L16 4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>
              <circle cx="23" cy="8" r="1" fill="currentColor"/>
            </svg>
            <span style="font-size: 28px; font-weight: bold; color: #E5D8C1;">HaDirot</span>
          </div>
          <h1 style="margin: 0; font-size: 24px;">Account Permissions Updated</h1>
        </div>
        
        <div style="padding: 30px; background-color: white; margin: 0 20px;">
          <h2 style="color: #4E4B43; margin-top: 0; font-size: 20px;">Hello ${userName}!</h2>
          
          <p style="color: #333; line-height: 1.6; font-size: 16px;">
            Your featured listing permissions have been updated by our admin team.
          </p>
          
          <div style="background-color: ${newLimit > 0 ? '#d4edda' : '#f8d7da'}; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${newLimit > 0 ? '#28a745' : '#dc3545'};">
            <h3 style="color: ${newLimit > 0 ? '#155724' : '#721c24'}; margin-top: 0; font-size: 18px;">
              ${newLimit > 0 ? '✅ Featured Listing Access' : '❌ Featured Listing Access Removed'}
            </h3>
            <p style="color: ${newLimit > 0 ? '#155724' : '#721c24'}; line-height: 1.6; margin: 0;">
              ${newLimit > 0 
                ? `You can now feature up to <strong>${newLimit}</strong> listing${newLimit === 1 ? '' : 's'} at a time.`
                : 'You no longer have access to feature listings.'
              }
            </p>
            ${previousLimit !== undefined ? `
              <p style="color: #666; font-size: 14px; margin-top: 10px; margin-bottom: 0;">
                Previous limit: ${previousLimit} listing${previousLimit === 1 ? '' : 's'}
              </p>
            ` : ''}
          </div>
          
          ${newLimit > 0 ? `
            <div style="background-color: #e8f4f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #4E4B43; margin-top: 0; font-size: 18px;">⭐ Featured Listing Benefits:</h3>
              <ul style="color: #555; line-height: 1.6; margin: 0; padding-left: 20px;">
                <li>Premium placement in search results</li>
                <li>Highlighted with special badges</li>
                <li>Increased visibility to potential tenants</li>
                <li>Priority display on the homepage</li>
              </ul>
            </div>
          ` : ''}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${window.location.origin}/dashboard" 
               style="background-color: #4E4B43; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
              View My Dashboard
            </a>
          </div>
          
          <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
            <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0;">
              If you have any questions about these changes, please contact our support team.
            </p>
          </div>
        </div>
        
        <div style="background-color: #4E4B43; color: #E5D8C1; padding: 20px; text-align: center; margin: 0 20px;">
          <p style="margin: 0; font-size: 14px;">
            © 2025 HaDirot. All rights reserved.<br>
            NYC's premier Jewish rental platform
          </p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: userEmail,
      subject: `Account Permissions Updated - HaDirot`,
      html,
    });
  },

  // Helper function to send password reset email
  async sendPasswordResetEmail(email: string): Promise<EmailResponse> {
    // The Edge Function will handle generating the reset link and sending the branded email
    return this.sendEmail({
      to: email,
      subject: 'Reset your HaDirot password',
      html: '', // Will be generated by Edge Function
      type: 'password_reset',
    });
  },

  // Helper function to send listing deletion confirmation email
  async sendListingDeletedEmail(userEmail: string, userName: string, listingTitle: string): Promise<EmailResponse> {
    console.log('📧 Sending listing deletion email to:', userEmail);
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9;">
        <div style="background-color: #dc3545; color: white; padding: 30px; text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 10px;">
            <svg width="40" height="40" viewBox="0 0 32 32" style="color: white; margin-right: 10px;">
              <path d="M16 4L6 12v16h5v-8h10v8h5V12L16 4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>
              <circle cx="23" cy="8" r="1" fill="currentColor"/>
            </svg>
            <span style="font-size: 28px; font-weight: bold;">HaDirot</span>
          </div>
          <h1 style="margin: 0; font-size: 24px;">Listing Deleted</h1>
        </div>
        
        <div style="padding: 30px; background-color: white; margin: 0 20px;">
          <h2 style="color: #4E4B43; margin-top: 0; font-size: 20px;">Hello ${userName}!</h2>
          
          <p style="color: #333; line-height: 1.6; font-size: 16px;">
            Your listing "<strong>${listingTitle}</strong>" has been permanently deleted from HaDirot.
          </p>
          
          <div style="background-color: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
            <p style="color: #721c24; line-height: 1.6; margin: 0;">
              <strong>This action cannot be undone.</strong> The listing and all associated data have been permanently removed from our platform.
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${window.location.origin}/dashboard" 
               style="background-color: #4E4B43; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
              View My Dashboard
            </a>
          </div>
        </div>
        
        <div style="background-color: #4E4B43; color: #E5D8C1; padding: 20px; text-align: center; margin: 0 20px;">
          <p style="margin: 0; font-size: 14px;">
            © 2025 HaDirot. All rights reserved.<br>
            NYC's premier Jewish rental platform
          </p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: userEmail,
      subject: `Listing Deleted: ${listingTitle} - HaDirot`,
      html,
    });
  },

  // Helper function to send listing update confirmation email
  async sendListingUpdatedEmail(userEmail: string, userName: string, listingTitle: string): Promise<EmailResponse> {
    console.log('📧 Sending listing update email to:', userEmail);
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9;">
        <div style="background-color: #4E4B43; color: white; padding: 30px; text-align: center;">
          <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 10px;">
            <svg width="40" height="40" viewBox="0 0 32 32" style="color: #E5D8C1; margin-right: 10px;">
              <path d="M16 4L6 12v16h5v-8h10v8h5V12L16 4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>
              <circle cx="23" cy="8" r="1" fill="currentColor"/>
            </svg>
            <span style="font-size: 28px; font-weight: bold; color: #E5D8C1;">HaDirot</span>
          </div>
          <h1 style="margin: 0; font-size: 24px;">Listing Updated Successfully!</h1>
        </div>
        
        <div style="padding: 30px; background-color: white; margin: 0 20px;">
          <h2 style="color: #4E4B43; margin-top: 0; font-size: 20px;">Hello ${userName}!</h2>
          
          <p style="color: #333; line-height: 1.6; font-size: 16px;">
            Your listing "<strong>${listingTitle}</strong>" has been updated successfully on HaDirot.
          </p>
          
          <div style="background-color: #e8f4f8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="color: #555; line-height: 1.6; margin: 0;">
              Your changes are now live and visible to potential tenants browsing HaDirot.
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${window.location.origin}/dashboard" 
               style="background-color: #4E4B43; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
              View My Dashboard
            </a>
          </div>
        </div>
        
        <div style="background-color: #4E4B43; color: #E5D8C1; padding: 20px; text-align: center; margin: 0 20px;">
          <p style="margin: 0; font-size: 14px;">
            © 2025 HaDirot. All rights reserved.<br>
            NYC's premier Jewish rental platform
          </p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to: userEmail,
      subject: `Listing Updated: ${listingTitle} - HaDirot`,
      html,
    });
  },
};