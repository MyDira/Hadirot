import React, { useState } from "react";
import { Flag } from "lucide-react";
import { Listing } from "../../config/supabase";
import { emailService } from "../../services/email";
import { gaEvent } from "../../lib/ga";
import { Toast } from "../shared/Toast";

interface ReportRentedButtonProps {
  listing: Listing;
  userFullName?: string;
  userEmail?: string;
}

export function ReportRentedButton({ listing, userFullName, userEmail }: ReportRentedButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [hasReported, setHasReported] = useState(() => {
    try {
      const reported = localStorage.getItem(`reported_rented_${listing.id}`);
      return reported === "true";
    } catch {
      return false;
    }
  });

  const handleReport = async () => {
    if (hasReported || isSubmitting) return;

    setIsSubmitting(true);

    try {
      console.log("Sending report for listing:", listing.id);

      const response = await emailService.sendListingRentedReport(
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
          name: userFullName || "Anonymous User",
          email: userEmail || "anonymous@hadirot.com",
        }
      );

      console.log("Email service response:", response);

      if (!response.success) {
        throw new Error(response.error || "Failed to send report");
      }

      try {
        localStorage.setItem(`reported_rented_${listing.id}`, "true");
      } catch (error) {
        console.warn("Failed to save report status to localStorage:", error);
      }

      setHasReported(true);
      setShowToast(true);

      gaEvent("listing_reported_as_rented", {
        listing_id: listing.id,
        user_authenticated: !!userEmail,
      });
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
        onClick={handleReport}
        className="text-xs text-gray-500 hover:text-gray-700 transition-colors inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
        type="button"
        disabled={isSubmitting}
      >
        <Flag className="w-3 h-3" />
        {isSubmitting ? "Reporting..." : "Report as rented"}
      </button>

      {showToast && (
        <Toast
          message="Thank you for reporting. An admin has been notified."
          onClose={() => setShowToast(false)}
        />
      )}
    </>
  );
}
