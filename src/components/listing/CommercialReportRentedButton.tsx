import React, { useState, useEffect } from "react";
import { Flag } from "lucide-react";
import { CommercialListing } from "../../config/supabase";
import { gaListing } from "../../lib/ga";
import { Toast } from "../shared/Toast";

interface CommercialReportRentedButtonProps {
  listing: CommercialListing;
  userFullName?: string;
  userEmail?: string;
}

/**
 * Commercial counterpart to ReportRentedButton.
 *
 * Calls the same `send-report-rented-sms` edge function the residential
 * flow uses, but with `isCommercial: true` so the function queries the
 * `commercial_listings` table and tags the resulting renewal conversation
 * row with is_commercial = true (so the SMS-reply webhook updates the
 * right table on a NO reply).
 *
 * Visual + interaction parity with ReportRentedButton: same Flag icon,
 * same disabled state once submitted, same localStorage memoization,
 * same Toast on success.
 */
export function CommercialReportRentedButton({
  listing,
  userFullName,
  userEmail,
}: CommercialReportRentedButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [hasReported, setHasReported] = useState(() => {
    try {
      const reported = localStorage.getItem(`reported_rented_commercial_${listing.id}`);
      return reported === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      const reported = localStorage.getItem(`reported_rented_commercial_${listing.id}`);
      setHasReported(reported === "true");
    } catch {
      setHasReported(false);
    }
  }, [listing.id]);

  const isSale = listing.listing_type === 'sale';
  const buttonLabel = isSale ? "Report Sold" : "Report Rented";
  const reportedLabel = "Already Reported";

  const handleReport = async () => {
    if (hasReported || isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (!listing.contact_phone) {
        throw new Error("This listing has no contact phone on file.");
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/send-report-rented-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          listingId: listing.id,
          reporterName: userFullName || "Anonymous User",
          reporterEmail: userEmail || "anonymous@hadirot.com",
          isCommercial: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send report");
      }

      try {
        localStorage.setItem(`reported_rented_commercial_${listing.id}`, "true");
      } catch (error) {
        console.warn("Failed to save report status to localStorage:", error);
      }

      setHasReported(true);
      setShowToast(true);

      gaListing("commercial_listing_reported", listing.id, {
        user_authenticated: !!userEmail,
        listing_type: listing.listing_type,
      });
    } catch (error) {
      console.error("Error submitting commercial report:", error);
      alert("Failed to submit report. Please try again.");
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
        <span className="text-sm font-medium text-gray-500">{reportedLabel}</span>
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
          {isSubmitting ? "Reporting..." : buttonLabel}
        </span>
      </button>

      {showToast && (
        <Toast
          message="Thank you for reporting. The listing owner has been notified."
          onClose={() => setShowToast(false)}
        />
      )}
    </>
  );
}
