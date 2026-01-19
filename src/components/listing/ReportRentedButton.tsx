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

  const sendEmailFallback = async () => {
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

    if (!response.success) {
      throw new Error(response.error || "Failed to send report");
    }

    return "email";
  };

  const handleReport = async () => {
    if (hasReported || isSubmitting) return;

    setIsSubmitting(true);

    try {
      console.log("Sending report for listing:", listing.id);

      let method = "sms";

      if (listing.contact_phone) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

        const response = await fetch(`${supabaseUrl}/functions/v1/send-report-rented-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            listingId: listing.id,
            reporterName: userFullName || "Anonymous User",
            reporterEmail: userEmail || "anonymous@hadirot.com"
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to send report");
        }

        if (data.fallback) {
          console.log("SMS not available, falling back to email");
          method = await sendEmailFallback();
        } else if (data.alreadyInactive) {
          console.log("Listing already inactive");
        } else {
          console.log("SMS report sent:", data);
        }
      } else {
        console.log("No contact phone, using email fallback");
        method = await sendEmailFallback();
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
        method,
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
          message="Thank you for reporting. The listing owner has been notified."
          onClose={() => setShowToast(false)}
        />
      )}
    </>
  );
}
