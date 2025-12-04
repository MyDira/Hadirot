import { supabase, AdminSettings, SalesPermissionRequest, Profile } from '../config/supabase';

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
      const { data: admins, error: adminsError } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('is_admin', true);

      if (adminsError) {
        console.error('Error fetching admins:', error);
        return;
      }

      const { data: user } = await supabase
        .from('profiles')
        .select('full_name, email, phone, role')
        .eq('id', request.user_id)
        .maybeSingle();

      if (!admins || admins.length === 0 || !user) {
        return;
      }

      const adminEmails = admins.map(a => a.email).filter(Boolean);

      if (adminEmails.length === 0) {
        return;
      }

      await supabase.functions.invoke('send-email', {
        body: {
          to: adminEmails,
          subject: `New Sales Permission Request from ${user.full_name}`,
          html: `
            <h2>New Sales Listing Permission Request</h2>
            <p>A user has requested permission to post sale listings.</p>
            <h3>User Details:</h3>
            <ul>
              <li><strong>Name:</strong> ${user.full_name}</li>
              <li><strong>Email:</strong> ${user.email || 'N/A'}</li>
              <li><strong>Phone:</strong> ${user.phone || 'N/A'}</li>
              <li><strong>Role:</strong> ${user.role}</li>
            </ul>
            <h3>Request Message:</h3>
            <p>${request.request_message}</p>
            <p><a href="${window.location.origin}/admin?tab=sales">Review Request in Admin Panel</a></p>
          `,
        },
      });
    } catch (error) {
      console.error('Error notifying admins:', error);
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
      const { data: user } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', userId)
        .maybeSingle();

      if (!user?.email) {
        return;
      }

      await supabase.functions.invoke('send-email', {
        body: {
          to: [user.email],
          subject: 'Your Sales Listing Permission Request Has Been Approved',
          html: `
            <h2>Permission Approved!</h2>
            <p>Hi ${user.full_name},</p>
            <p>Great news! Your request to post sale listings has been approved.</p>
            <p>You can now create and publish sale listings on our platform.</p>
            ${adminNotes ? `<p><strong>Note from admin:</strong> ${adminNotes}</p>` : ''}
            <p><a href="${window.location.origin}/post-listing">Post Your First Sale Listing</a></p>
          `,
        },
      });
    } catch (error) {
      console.error('Error notifying user of approval:', error);
    }
  },

  async notifyUserOfDenial(userId: string, adminNotes?: string): Promise<void> {
    try {
      const { data: user } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', userId)
        .maybeSingle();

      if (!user?.email) {
        return;
      }

      await supabase.functions.invoke('send-email', {
        body: {
          to: [user.email],
          subject: 'Update on Your Sales Listing Permission Request',
          html: `
            <h2>Permission Request Update</h2>
            <p>Hi ${user.full_name},</p>
            <p>Thank you for your interest in posting sale listings on our platform.</p>
            <p>After reviewing your request, we are unable to grant sales listing permissions at this time.</p>
            ${adminNotes ? `<p><strong>Reason:</strong> ${adminNotes}</p>` : ''}
            <p>If you have any questions or would like to discuss this further, please contact our support team.</p>
          `,
        },
      });
    } catch (error) {
      console.error('Error notifying user of denial:', error);
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
