import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_URL = 'https://api.resend.com/emails';

interface EmailRequest {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  type?: 'password_reset' | 'general';
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get the authorization header at the start
    const authHeader = req.headers.get('Authorization');

    // Get the Resend API key from Supabase secrets
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not found in environment variables');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse the request body
    let emailData: EmailRequest;
    try {
      emailData = await req.json();
      console.log('📧 Email request received:', {
        to: emailData.to,
        subject: emailData.subject,
        type: emailData.type,
        hasAuth: !!authHeader
      });
    } catch (error) {
      console.error('❌ Invalid JSON in request body:', error);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    const isPasswordReset = emailData.type === 'password_reset';

    // For non-password-reset emails, require authentication
    if (!isPasswordReset && !authHeader) {
      console.log('❌ Missing authorization for non-password-reset email');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Create Supabase admin client for password resets
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Handle password reset emails specially
    if (isPasswordReset) {
      console.log('🔐 Processing password reset for:', emailData.to);
      
      try {
        const resetEmail = Array.isArray(emailData.to) ? emailData.to[0] : emailData.to;
        const redirectUrl = `${Deno.env.get('VITE_SITE_URL') || 'http://localhost:5173'}/auth`;
        
        console.log('🔗 Generating reset link with params:', {
          email: resetEmail,
          redirectTo: redirectUrl
        });

        // Generate password reset link using admin client (without sending Supabase's default email)
        const { data, error: resetError } = await supabaseAdmin.auth.admin.generatePasswordResetLink(
          resetEmail,
          {
            redirectTo: redirectUrl,
            sendEmail: false, // Prevent Supabase from sending its own email
          }
        );

        if (resetError) {
          console.error('❌ Error generating password reset link:', {
            error: resetError,
            message: resetError.message,
            status: resetError.status,
            email: resetEmail,
            redirectTo: redirectUrl
          });
          
          // Handle rate limit errors specifically
          if (resetError.status === 429 || resetError.message?.includes('For security purposes, you can only request this after')) {
            return new Response(
              JSON.stringify({ 
                error: resetError.message || 'Rate limit exceeded. Please wait before requesting another password reset.',
                code: 'rate_limit_exceeded'
              }),
              {
                status: 429,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }
            );
          }
          
          return new Response(
            JSON.stringify({ error: resetError.message || 'Failed to generate password reset link' }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        if (!data?.properties?.action_link) {
          console.error('❌ No action link in reset response:', data);
          return new Response(
            JSON.stringify({ error: 'Failed to generate reset link' }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        const resetLink = data.properties.action_link;
        console.log('✅ Password reset link generated successfully:', {
          email: resetEmail,
          hasActionLink: !!resetLink,
          linkLength: resetLink.length
        });

        // Create branded password reset email HTML
        const resetHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #F0E6D5;">
            <div style="background-color: #273140; color: white; padding: 30px; text-align: center;">
              <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 10px;">
                <svg width="40" height="40" viewBox="0 0 32 32" style="color: #F0E6D5; margin-right: 10px;">
                  <path d="M16 4L6 12v16h5v-8h10v8h5V12L16 4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>
                  <circle cx="23" cy="8" r="1" fill="currentColor"/>
                </svg>
                <span style="font-size: 28px; font-weight: bold; color: #F0E6D5;">HaDirot</span>
              </div>
              <h1 style="margin: 0; font-size: 24px;">Reset Your Password</h1>
            </div>
            
            <div style="padding: 30px; background-color: white; margin: 0 20px;">
              <h2 style="color: #273140; margin-top: 0; font-size: 20px;">Password Reset Request</h2>
              
              <p style="color: #333; line-height: 1.6; font-size: 16px;">
                We received a request to reset your password for your HaDirot account.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetLink}" 
                   style="background-color: #C5594C; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
                  Reset My Password
                </a>
              </div>
              
              <div style="background-color: #F0E6D5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #C5594C;">
                <p style="color: #273140; line-height: 1.6; margin: 0;">
                  <strong>Security Note:</strong> This link will expire in 1 hour. If you didn't request this password reset, 
                  you can safely ignore this email. Your account remains secure.
                </p>
              </div>
              
              <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
                <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 0;">
                  If the button above doesn't work, copy and paste this link into your browser:<br>
                  <a href="${resetLink}" style="color: #273140; word-break: break-all;">${resetLink}</a>
                </p>
              </div>
            </div>
            
            <div style="background-color: #273140; color: #F0E6D5; padding: 20px; text-align: center; margin: 0 20px;">
              <p style="margin: 0; font-size: 14px;">
                © 2025 HaDirot. All rights reserved.<br>
                NYC's premier Jewish rental platform
              </p>
            </div>
          </div>
        `;

        // Override the email data for password reset
        emailData = {
          ...emailData,
          html: resetHtml,
          from: 'HaDirot <noreply@hadirot.com>',
        };

        console.log('🎨 Generated branded password reset email for:', emailData.to);
      } catch (error) {
        console.error('❌ Error in password reset flow:', {
          error: error,
          message: error.message,
          stack: error.stack,
          email: emailData.to
        });
        return new Response(
          JSON.stringify({ error: 'Failed to process password reset' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    } else if (authHeader) {
      // For non-password-reset emails, verify the session
      try {
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? ''
        );

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

        if (authError || !user) {
          console.error('❌ Auth verification failed:', authError);
          return new Response(
            JSON.stringify({ error: 'Invalid authorization' }),
            {
              status: 401,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        console.log('✅ Auth verified for user:', user.id);
      } catch (error) {
        console.error('❌ Error verifying auth:', error);
        return new Response(
          JSON.stringify({ error: 'Authentication verification failed' }),
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Validate required fields
    if (!emailData.to || !emailData.subject) {
      console.error('❌ Missing required fields:', { to: !!emailData.to, subject: !!emailData.subject });
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields: to and subject are required' 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // For non-password-reset emails, require HTML content
    if (!isPasswordReset && !emailData.html) {
      console.error('❌ Missing HTML content for non-password-reset email');
      return new Response(
        JSON.stringify({ 
          error: 'Missing required field: html content is required for non-password-reset emails' 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Prepare the email payload for Resend
    const emailPayload = {
      from: emailData.from || 'HaDirot <noreply@hadirot.com>',
      to: Array.isArray(emailData.to) ? emailData.to : [emailData.to],
      subject: emailData.subject,
      html: emailData.html,
    };

    console.log('📤 Sending email via Resend:', {
      to: emailPayload.to,
      subject: emailPayload.subject,
      from: emailPayload.from,
      htmlLength: emailPayload.html.length
    });

    try {
      // Send email via Resend API
      const resendResponse = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
      });

      if (!resendResponse.ok) {
        const errorData = await resendResponse.text();
        console.error('❌ Resend API error:', {
          status: resendResponse.status,
          statusText: resendResponse.statusText,
          errorData: errorData,
          payload: emailPayload
        });
        
        return new Response(
          JSON.stringify({ 
            error: 'Failed to send email',
            details: resendResponse.status === 422 ? 'Invalid email data' : 'Email service error',
            resendStatus: resendResponse.status
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const resendData = await resendResponse.json();
      console.log('✅ Email sent successfully via Resend:', {
        id: resendData.id,
        to: emailPayload.to,
        subject: emailPayload.subject,
        type: isPasswordReset ? 'password_reset' : 'general'
      });

      return new Response(
        JSON.stringify({ 
          success: true,
          id: resendData.id 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      console.error('❌ Error calling Resend API:', {
        error: error,
        message: error.message,
        stack: error.stack
      });
      
      return new Response(
        JSON.stringify({ error: 'Failed to send email via Resend' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

  } catch (error) {
    console.error('❌ Unexpected error in send-email function:', {
      error: error,
      message: error.message,
      stack: error.stack
    });
    
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});