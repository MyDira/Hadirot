import React from "react";
import type { ListingFormData } from "./types";

interface ContactAndSubmitSectionProps {
  formData: ListingFormData;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  setFormData: React.Dispatch<React.SetStateAction<ListingFormData>>;
  loading: boolean;
  uploadingMedia?: boolean;
}

export function ContactAndSubmitSection({
  formData,
  handleInputChange,
  setFormData,
  loading,
  uploadingMedia = false,
}: ContactAndSubmitSectionProps) {
  return (
    <>
      {/* Contact Information */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 relative">
        <h2 className="text-xl font-semibold text-brand-700 mb-4">
          Contact Information
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Name *
            </label>
            <input
              type="text"
              name="contact_name"
              value={formData.contact_name}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Phone *
            </label>
            <input
              type="tel"
              name="contact_phone"
              value={formData.contact_phone}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
            />
          </div>
        </div>
      </div>

      {/* Terms & Conditions Agreement */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 relative">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={formData.terms_agreed}
            onChange={(e) => setFormData(prev => ({ ...prev, terms_agreed: e.target.checked }))}
            className="mt-1 h-4 w-4 text-accent-600 focus:ring-accent-500 border-gray-300 rounded"
          />
          <span className="text-sm text-gray-700">
            I agree to receive SMS messages about my listing and inquiries. Message and data rates may apply. See <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-700 font-semibold hover:underline">Privacy Policy</a> and <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-brand-700 font-semibold hover:underline">Terms of Use</a> for more information.
          </span>
        </label>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading || uploadingMedia || !formData.terms_agreed}
          className="bg-accent-500 text-white px-8 py-3 rounded-md font-semibold hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Creating Listing..." : uploadingMedia ? "Uploading Photos..." : "Post Listing"}
        </button>
      </div>
    </>
  );
}
