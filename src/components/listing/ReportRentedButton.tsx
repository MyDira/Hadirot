import React, { useState, useEffect } from "react";
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

  useEffect(() => {
    try {
      const reported = localStorage.getItem(`reported_rented_${listing.id}`);
      setHasReported(reported === "true");
    } catch {
      setHasReported(false);
    }
  }, [listing.id]);

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
      <button
        className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md bg-gray-100 cursor-not-allowed opacity-60"
        disabled
      >
        <Flag className="w-5 h-5 text-gray-500 mr-2" />
        <span className="text-sm font-medium text-gray-500">Already Reported</span>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={handleReport}
        className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        type="button"
        disabled={isSubmitting}
      >
        <Flag className="w-5 h-5 text-gray-600 mr-2" />
        <span className="text-sm font-medium text-gray-700">
          {isSubmitting ? "Reporting..." : "Report Rented"}
        </span>
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
