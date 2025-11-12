import React, { useState } from "react";
import { Flag, X } from "lucide-react";
import { Listing } from "../../config/supabase";
import { emailService } from "../../services/email";
import { gaEvent } from "../../lib/ga";

interface ReportRentedButtonProps {
  listing: Listing;
  userFullName: string;
  userEmail: string;
}

export function ReportRentedButton({ listing, userFullName, userEmail }: ReportRentedButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasReported, setHasReported] = useState(() => {
    try {
      const reported = localStorage.getItem(`reported_rented_${listing.id}`);
      return reported === "true";
    } catch {
      return false;
    }
  });

  const handleOpenModal = () => {
    if (hasReported) {
      return;
    }
    setShowModal(true);
    gaEvent("listing_report_modal_opened", {
      listing_id: listing.id,
    });
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting || hasReported) return;

    setIsSubmitting(true);

    try {
      await emailService.sendListingRentedReport(
        {
          id: listing.id,
          title: listing.title,
          location: listing.location,
          neighborhood: listing.neighborhood,
          price: listing.price,
          call_for_price: listing.call_for_price,
          bedrooms: listing.bedrooms,
          bathrooms: listing.bathrooms,
          property_type: listing.property_type,
          contact_name: listing.contact_name,
          contact_phone: listing.contact_phone,
          created_at: listing.created_at,
        },
        {
          name: userFullName,
          email: userEmail,
          notes: notes.trim() || undefined,
        }
      );

      try {
        localStorage.setItem(`reported_rented_${listing.id}`, "true");
      } catch (error) {
        console.warn("Failed to save report status to localStorage:", error);
      }

      setHasReported(true);
      setShowModal(false);
      setNotes("");

      gaEvent("listing_reported_as_rented", {
        listing_id: listing.id,
        has_notes: !!notes.trim(),
      });

      alert("Thank you for reporting this listing. An admin has been notified.");
    } catch (error) {
      console.error("Error submitting report:", error);
      alert("Failed to submit report. Please try again.");

      gaEvent("listing_report_error", {
        listing_id: listing.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hasReported) {
    return (
      <div className="text-xs text-gray-500 italic">
        You have already reported this listing
      </div>
    );
  }

  return (
    <>
      <button
        onClick={handleOpenModal}
        className="text-xs text-gray-500 hover:text-gray-700 transition-colors inline-flex items-center gap-1"
        type="button"
      >
        <Flag className="w-3 h-3" />
        Report as rented
      </button>

      {showModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={handleCloseModal}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleCloseModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              type="button"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Flag className="w-5 h-5 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Report Listing as Rented
                </h3>
              </div>
              <p className="text-sm text-gray-600">
                If this property has already been rented, let us know so we can keep our listings up to date.
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label
                  htmlFor="report-notes"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Additional notes (optional)
                </label>
                <textarea
                  id="report-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E4A74] focus:border-transparent resize-none"
                  rows={3}
                  placeholder="Any additional information about this listing..."
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-[#273140] text-white rounded-md hover:bg-[#1e252f] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Submit Report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
