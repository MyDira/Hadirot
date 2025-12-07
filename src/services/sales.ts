import { supabase, AdminSettings, SalesPermissionRequest, Profile } from '../config/supabase';
import { emailService, renderBrandEmail } from './email';

export const salesService = {
  async getSalesSettings(): Promise<AdminSettings | null> {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching sales settings:', error);
      throw error;
    }

    return data;
  },

  async isSalesFeatureEnabled(): Promise<boolean> {
    try {
      const settings = await this.getSalesSettings();
      return settings?.sales_feature_enabled || false;
    } catch (error) {
      console.error('Error checking sales feature status:', error);
      return false;
    }
  },

  async canUserPostSales(userId: string): Promise<boolean> {
    try {
      const settings = await this.getSalesSettings();

      if (!settings?.sales_feature_enabled) {
        return false;
      }

      if (settings.sales_universal_access) {
        return true;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('can_post_sales, is_admin')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error checking user sales permission:', error);
        return false;
      }

      return profile?.is_admin || profile?.can_post_sales || false;
    } catch (error) {
      console.error('Error checking user sales permission:', error);
      return false;
    }
  },

  async getUserPermissionRequest(userId: string): Promise<SalesPermissionRequest | null> {
    const { data, error } = await supabase
      .from('sales_permission_requests')
      .select('*')
      .eq('user_id', userId)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching permission request:', error);
      throw error;
    }

    return data;
  },

  async createPermissionRequest(userId: string, message: string): Promise<SalesPermissionRequest> {
    const { data, error } = await supabase
      .from('sales_permission_requests')
      .insert({
        user_id: userId,
        request_message: message,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating permission request:', error);
      throw error;
    }

    await this.notifyAdminsOfNewRequest(data);

    return data;
  },

  async notifyAdminsOfNewRequest(request: SalesPermissionRequest): Promise<void> {
    try {
      const { data: user } = await supabase
        .from('profiles')
        .select('full_name, email, phone, role')
        .eq('id', request.user_id)
        .maybeSingle();

      if (!user) {
        console.error('User not found for permission request');
        return;
      }

      const siteUrl = window.location.origin;

      const bodyHtml = `
        <p style="margin-top:0;">A user has requested permission to post sale listings on the platform.</p>

        <div style="margin:20px 0;padding:16px;background-color:#EEF2FF;border-radius:8px;">
          <h3 style="margin:0 0 12px 0;color:#1E4A74;">User Details</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:6px 0;color:#6B7280;width:30%;"><strong>Name:</strong></td>
              <td style="padding:6px 0;">${user.full_name}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#6B7280;"><strong>Email:</strong></td>
              <td style="padding:6px 0;">${user.email || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#6B7280;"><strong>Phone:</strong></td>
              <td style="padding:6px 0;">${user.phone || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#6B7280;"><strong>Role:</strong></td>
              <td style="padding:6px 0;">${user.role}</td>
            </tr>
          </table>
        </div>

        <div style="margin:20px 0;padding:16px;background-color:#FEF3C7;border-left:4px solid #F59E0B;border-radius:4px;">
          <strong>Request Message:</strong>
          <p style="margin:8px 0 0 0;">${request.request_message.replace(/\n/g, '<br>')}</p>
        </div>

        <p style="margin-top:20px;">
          <a href="${siteUrl}/admin?tab=sales" style="color:#1E4A74;text-decoration:underline;">Review Request in Admin Panel</a>
        </p>
      `;

      const html = renderBrandEmail({
        title: 'Sales Permission Request',
        bodyHtml,
      });

      const result = await emailService.sendEmail({
        to: 'admin@hadirot.com',
        subject: `[HaDirot Admin] Sales Permission Request from ${user.full_name}`,
        html,
        type: 'admin_notification',
      });

      if (!result.success) {
        console.error('Error sending admin notification:', result.error);
        throw new Error(result.error || 'Failed to send admin notification');
      }

      console.log('✅ Admin notification email sent successfully');
    } catch (error) {
      console.error('Error notifying admins:', error);
      throw error;
    }
  },

  async getAllPermissionRequests(): Promise<SalesPermissionRequest[]> {
    const { data, error } = await supabase
      .from('sales_permission_requests')
      .select(`
        *,
        user:profiles!sales_permission_requests_user_id_fkey(id, full_name, email, phone, role),
        admin:profiles!sales_permission_requests_responded_by_admin_id_fkey(id, full_name)
      `)
      .order('requested_at', { ascending: false });

    if (error) {
      console.error('Error fetching permission requests:', error);
      throw error;
    }

    return data || [];
  },

  async getPendingPermissionRequests(): Promise<SalesPermissionRequest[]> {
    const { data, error } = await supabase
      .from('sales_permission_requests')
      .select(`
        *,
        user:profiles!sales_permission_requests_user_id_fkey(id, full_name, email, phone, role)
      `)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending requests:', error);
      throw error;
    }

    return data || [];
  },

  async approvePermissionRequest(
    requestId: string,
    adminId: string,
    adminNotes?: string
  ): Promise<void> {
    const { error: updateError } = await supabase
      .from('sales_permission_requests')
      .update({
        status: 'approved',
        responded_at: new Date().toISOString(),
        responded_by_admin_id: adminId,
        admin_notes: adminNotes,
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Error approving request:', updateError);
      throw updateError;
    }

    const { data: request } = await supabase
      .from('sales_permission_requests')
      .select('user_id')
      .eq('id', requestId)
      .maybeSingle();

    if (!request) {
      throw new Error('Request not found');
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ can_post_sales: true })
      .eq('id', request.user_id);

    if (profileError) {
      console.error('Error updating user profile:', profileError);
      throw profileError;
    }

    await this.notifyUserOfApproval(request.user_id, adminNotes);
  },

  async denyPermissionRequest(
    requestId: string,
    adminId: string,
    adminNotes?: string
  ): Promise<void> {
    const { data: request, error: fetchError } = await supabase
      .from('sales_permission_requests')
      .select('user_id')
      .eq('id', requestId)
      .maybeSingle();

    if (fetchError || !request) {
      console.error('Error fetching request:', fetchError);
      throw fetchError || new Error('Request not found');
    }

    const { error: updateError } = await supabase
      .from('sales_permission_requests')
      .update({
        status: 'denied',
        responded_at: new Date().toISOString(),
        responded_by_admin_id: adminId,
        admin_notes: adminNotes,
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Error denying request:', updateError);
      throw updateError;
    }

    await this.notifyUserOfDenial(request.user_id, adminNotes);
  },

  async notifyUserOfApproval(userId: string, adminNotes?: string): Promise<void> {
    try {
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);

      if (authError || !authUser?.user?.email) {
        console.error('Error fetching user email for approval notification:', authError);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();

      const userName = profile?.full_name || 'User';
      const userEmail = authUser.user.email;
      const siteUrl = window.location.origin;

      const adminNotesSection = adminNotes
        ? `<div style="margin:16px 0;padding:12px;background-color:#EEF2FF;border-left:4px solid:#3B82F6;border-radius:4px;">
            <strong>Note from admin:</strong>
            <p style="margin:8px 0 0 0;">${adminNotes.replace(/\n/g, '<br>')}</p>
          </div>`
        : '';

      const bodyHtml = `
        <p style="margin-top:0;">Hi ${userName},</p>
        <p>Great news! Your request to post sale listings has been approved.</p>
        <p>You can now create and publish sale listings on our platform.</p>
        ${adminNotesSection}
      `;

      const html = renderBrandEmail({
        title: 'Permission Approved!',
        bodyHtml,
        ctaLabel: 'Post Your First Sale Listing',
        ctaHref: `${siteUrl}/post-listing`,
      });

      const result = await emailService.sendEmail({
        to: userEmail,
        subject: 'Your Sales Listing Permission Request Has Been Approved',
        html,
      });

      if (!result.success) {
        console.error('Error sending approval notification:', result.error);
        throw new Error(result.error || 'Failed to send approval notification');
      }

      console.log('✅ Approval notification email sent successfully');
    } catch (error) {
      console.error('Error notifying user of approval:', error);
      throw error;
    }
  },

  async notifyUserOfDenial(userId: string, adminNotes?: string): Promise<void> {
    try {
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);

      if (authError || !authUser?.user?.email) {
        console.error('Error fetching user email for denial notification:', authError);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();

      const userName = profile?.full_name || 'User';
      const userEmail = authUser.user.email;

      const reasonSection = adminNotes
        ? `<div style="margin:16px 0;padding:12px;background-color:#FEF3C7;border-left:4px solid #F59E0B;border-radius:4px;">
            <strong>Reason:</strong>
            <p style="margin:8px 0 0 0;">${adminNotes.replace(/\n/g, '<br>')}</p>
          </div>`
        : '';

      const bodyHtml = `
        <p style="margin-top:0;">Hi ${userName},</p>
        <p>Thank you for your interest in posting sale listings on our platform.</p>
        <p>After reviewing your request, we are unable to grant sales listing permissions at this time.</p>
        ${reasonSection}
        <p>If you have any questions or would like to discuss this further, please contact our support team.</p>
      `;

      const html = renderBrandEmail({
        title: 'Permission Request Update',
        bodyHtml,
      });

      const result = await emailService.sendEmail({
        to: userEmail,
        subject: 'Update on Your Sales Listing Permission Request',
        html,
      });

      if (!result.success) {
        console.error('Error sending denial notification:', result.error);
        throw new Error(result.error || 'Failed to send denial notification');
      }

      console.log('✅ Denial notification email sent successfully');
    } catch (error) {
      console.error('Error notifying user of denial:', error);
      throw error;
    }
  },

  async updateSalesSettings(
    settings: Partial<Pick<AdminSettings, 'sales_feature_enabled' | 'sales_universal_access' | 'max_featured_sales'>>
  ): Promise<void> {
    const { error } = await supabase
      .from('admin_settings')
      .update(settings)
      .eq('id', (await this.getSalesSettings())?.id || '');

    if (error) {
      console.error('Error updating sales settings:', error);
      throw error;
    }
  },

  async toggleUserSalesPermission(userId: string, canPostSales: boolean): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ can_post_sales: canPostSales })
      .eq('id', userId);

    if (error) {
      console.error('Error toggling user sales permission:', error);
      throw error;
    }
  },
};
