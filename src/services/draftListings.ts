import { supabase, TempListingImage } from '../config/supabase';

export interface DraftData {
  // Form data only - no images
  title: string;
  description: string;
  location: string;
  neighborhood?: string;
  bedrooms: number;
  bathrooms: number;
  floor?: number;
  price: number;
  square_footage?: number;
  parking: string;
  washer_dryer_hookup: boolean;
  dishwasher: boolean;
  lease_length?: string;
  heat: string;
  property_type: string;
  contact_name: string;
  contact_phone: string;
  is_featured: boolean;
  tempImages?: TempListingImage[];
}

export const draftListingsService = {
  async saveDraft(draftData: DraftData, authIdentifier: string, tempImages?: TempListingImage[]): Promise<void> {
    try {
      const draftKey = `listing_draft_${authIdentifier}`;
      const fullDraftData = {
        ...draftData,
        tempImages: tempImages || []
      };
      localStorage.setItem(draftKey, JSON.stringify(fullDraftData));
      console.log('✅ Draft saved to local storage successfully for:', authIdentifier);
    } catch (error) {
      console.error('❌ Error saving draft:', error);
      throw error;
    }
  },

  async loadDraft(authIdentifier: string): Promise<DraftData | null> {
    try {
      const draftKey = `listing_draft_${authIdentifier}`;
      const draftString = localStorage.getItem(draftKey);
      if (draftString) {
        console.log('✅ Draft loaded from local storage for:', authIdentifier);
        return JSON.parse(draftString);
      }
      console.log('No draft found in local storage for:', authIdentifier);
      return null;
    } catch (error) {
      console.error('❌ Error loading draft:', error);
      return null;
    }
  },

  async deleteDraft(authIdentifier: string): Promise<void> {
    try {
      const draftKey = `listing_draft_${authIdentifier}`;
      localStorage.removeItem(draftKey);
      console.log('✅ Draft deleted from local storage for:', authIdentifier);
    } catch (error) {
      console.error('❌ Error deleting draft:', error);
      throw error;
    }
  },
};