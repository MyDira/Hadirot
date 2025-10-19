import { supabase } from '../config/supabase';

export interface ModalPopup {
  id: string;
  name: string;
  heading: string;
  subheading?: string;
  additional_text_lines: string[];
  button_text: string;
  button_url: string;
  is_active: boolean;
  trigger_pages: string[];
  display_frequency: 'once_per_session' | 'once_per_day' | 'once_per_lifetime' | 'until_clicked' | 'custom_interval';
  custom_interval_hours?: number;
  delay_seconds: number;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface ModalUserInteraction {
  id: string;
  modal_id: string;
  user_fingerprint: string;
  user_id?: string;
  interaction_type: 'shown' | 'dismissed' | 'clicked';
  interaction_timestamp: string;
  session_id: string;
  page_path: string;
}

export interface CreateModalInput {
  name: string;
  heading: string;
  subheading?: string;
  additional_text_lines?: string[];
  button_text: string;
  button_url: string;
  is_active?: boolean;
  trigger_pages?: string[];
  display_frequency?: ModalPopup['display_frequency'];
  custom_interval_hours?: number;
  delay_seconds?: number;
  priority?: number;
}

export interface UpdateModalInput extends Partial<CreateModalInput> {}

export const modalsService = {
  async getActiveModals(): Promise<ModalPopup[]> {
    const { data, error } = await supabase
      .from('modal_popups')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) {
      console.error('Error fetching active modals:', error);
      throw error;
    }

    return data || [];
  },

  async getAllModals(): Promise<ModalPopup[]> {
    const { data, error } = await supabase
      .from('modal_popups')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all modals:', error);
      throw error;
    }

    return data || [];
  },

  async getModalById(id: string): Promise<ModalPopup | null> {
    const { data, error } = await supabase
      .from('modal_popups')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching modal by id:', error);
      throw error;
    }

    return data;
  },

  async createModal(input: CreateModalInput): Promise<ModalPopup> {
    const { data, error } = await supabase
      .from('modal_popups')
      .insert({
        name: input.name,
        heading: input.heading,
        subheading: input.subheading || null,
        additional_text_lines: input.additional_text_lines || [],
        button_text: input.button_text,
        button_url: input.button_url,
        is_active: input.is_active ?? false,
        trigger_pages: input.trigger_pages || [],
        display_frequency: input.display_frequency || 'once_per_session',
        custom_interval_hours: input.custom_interval_hours || null,
        delay_seconds: input.delay_seconds ?? 0,
        priority: input.priority ?? 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating modal:', error);
      throw error;
    }

    return data;
  },

  async updateModal(id: string, input: UpdateModalInput): Promise<ModalPopup> {
    const updateData: Record<string, any> = {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.heading !== undefined) updateData.heading = input.heading;
    if (input.subheading !== undefined) updateData.subheading = input.subheading || null;
    if (input.additional_text_lines !== undefined) updateData.additional_text_lines = input.additional_text_lines;
    if (input.button_text !== undefined) updateData.button_text = input.button_text;
    if (input.button_url !== undefined) updateData.button_url = input.button_url;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;
    if (input.trigger_pages !== undefined) updateData.trigger_pages = input.trigger_pages;
    if (input.display_frequency !== undefined) updateData.display_frequency = input.display_frequency;
    if (input.custom_interval_hours !== undefined) updateData.custom_interval_hours = input.custom_interval_hours || null;
    if (input.delay_seconds !== undefined) updateData.delay_seconds = input.delay_seconds;
    if (input.priority !== undefined) updateData.priority = input.priority;

    const { data, error } = await supabase
      .from('modal_popups')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating modal:', error);
      throw error;
    }

    return data;
  },

  async deleteModal(id: string): Promise<void> {
    const { error } = await supabase
      .from('modal_popups')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting modal:', error);
      throw error;
    }
  },

  async recordModalInteraction(
    modalId: string,
    userFingerprint: string,
    interactionType: 'shown' | 'dismissed' | 'clicked',
    sessionId: string,
    pagePath: string,
    userId?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('modal_user_interactions')
      .insert({
        modal_id: modalId,
        user_fingerprint: userFingerprint,
        user_id: userId || null,
        interaction_type: interactionType,
        session_id: sessionId,
        page_path: pagePath,
      });

    if (error) {
      console.error('Error recording modal interaction:', error);
    }
  },

  async getUserModalHistory(
    modalId: string,
    userFingerprint: string,
    userId?: string
  ): Promise<ModalUserInteraction[]> {
    let query = supabase
      .from('modal_user_interactions')
      .select('*')
      .eq('modal_id', modalId)
      .order('interaction_timestamp', { ascending: false });

    if (userId) {
      query = query.or(`user_fingerprint.eq.${userFingerprint},user_id.eq.${userId}`);
    } else {
      query = query.eq('user_fingerprint', userFingerprint);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching user modal history:', error);
      return [];
    }

    return data || [];
  },

  async shouldDisplayModal(
    modal: ModalPopup,
    userFingerprint: string,
    sessionId: string,
    userId?: string
  ): Promise<boolean> {
    const history = await this.getUserModalHistory(modal.id, userFingerprint, userId);

    if (history.length === 0) {
      return true;
    }

    switch (modal.display_frequency) {
      case 'once_per_session': {
        const shownInSession = history.some(
          (h) => h.session_id === sessionId && h.interaction_type === 'shown'
        );
        return !shownInSession;
      }

      case 'once_per_day': {
        const dayAgo = new Date();
        dayAgo.setHours(dayAgo.getHours() - 24);
        const shownRecently = history.some(
          (h) => h.interaction_type === 'shown' && new Date(h.interaction_timestamp) > dayAgo
        );
        return !shownRecently;
      }

      case 'once_per_lifetime': {
        const everShown = history.some((h) => h.interaction_type === 'shown');
        return !everShown;
      }

      case 'until_clicked': {
        const everClicked = history.some((h) => h.interaction_type === 'clicked');
        return !everClicked;
      }

      case 'custom_interval': {
        if (!modal.custom_interval_hours) {
          return true;
        }
        const intervalAgo = new Date();
        intervalAgo.setHours(intervalAgo.getHours() - modal.custom_interval_hours);
        const shownRecently = history.some(
          (h) => h.interaction_type === 'shown' && new Date(h.interaction_timestamp) > intervalAgo
        );
        return !shownRecently;
      }

      default:
        return true;
    }
  },

  async getModalStatistics(modalId: string): Promise<{
    totalShown: number;
    totalClicked: number;
    totalDismissed: number;
    clickThroughRate: number;
  }> {
    const { data, error } = await supabase
      .from('modal_user_interactions')
      .select('interaction_type')
      .eq('modal_id', modalId);

    if (error) {
      console.error('Error fetching modal statistics:', error);
      return { totalShown: 0, totalClicked: 0, totalDismissed: 0, clickThroughRate: 0 };
    }

    const totalShown = data.filter((d) => d.interaction_type === 'shown').length;
    const totalClicked = data.filter((d) => d.interaction_type === 'clicked').length;
    const totalDismissed = data.filter((d) => d.interaction_type === 'dismissed').length;
    const clickThroughRate = totalShown > 0 ? (totalClicked / totalShown) * 100 : 0;

    return { totalShown, totalClicked, totalDismissed, clickThroughRate };
  },
};
