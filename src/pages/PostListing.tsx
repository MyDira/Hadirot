import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Upload, X, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { listingsService } from "../services/listings";
import { emailService, renderBrandEmail } from "../services/email";
import { draftListingsService, DraftData } from "../services/draftListings";
import { agenciesService } from "../services/agencies";
import { Modal } from "../components/shared/Modal";
import { AuthForm } from "../components/auth/AuthForm";
import { compressImage } from "../utils/imageUtils";
import { gaEvent } from "@/lib/ga";
import {
  ensurePostAttempt,
  trackPostStart,
  trackPostSubmit,
  trackPostSuccess,
  trackPostAbandoned,
  resetPostingState,
} from "../lib/analytics";
import {
  PropertyType,
  ParkingType,
  HeatType,
  LeaseLength,
  TempListingImage,
  AcType,
  ApartmentCondition,
} from "../config/supabase";

interface ListingFormData {
  title: string;
  description: string;
  location: string;
  neighborhood: string;
  bedrooms: number;
  bathrooms: number;
  additional_rooms?: number | null;
  floor?: number;
  price: number | null;
  call_for_price: boolean;
  square_footage?: number;
  parking: ParkingType;
  washer_dryer_hookup: boolean;
  dishwasher: boolean;
  lease_length?: LeaseLength | null;
  heat: HeatType;
  ac_type?: AcType | null;
  apartment_conditions?: ApartmentCondition[];
  property_type: PropertyType;
  contact_name: string;
  contact_phone: string;
  is_featured: boolean;
  broker_fee: boolean;
}

export function PostListing() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const userRole = profile?.role;
  const [loading, setLoading] = useState(false);
  const [tempImages, setTempImages] = useState<TempListingImage[]>([]);
  const [uploadingImages, setUploadingImages] = useState<{
    [key: string]: boolean;
  }>({});
  const [savingDraft, setSavingDraft] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [neighborhoodSelectValue, setNeighborhoodSelectValue] = useState<string>("");
  const [showCustomNeighborhood, setShowCustomNeighborhood] = useState(false);
  const [customNeighborhoodInput, setCustomNeighborhoodInput] = useState("");
  const [ownedAgencyId, setOwnedAgencyId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ListingFormData>({
    title: "",
    description: "",
    location: "",
    neighborhood: "",
    bedrooms: 1,
    bathrooms: 1,
    additional_rooms: null,
    floor: undefined,
    price: null,
    call_for_price: false,
    square_footage: undefined,
    parking: "no",
    washer_dryer_hookup: false,
    dishwasher: false,
    lease_length: null,
    heat: "tenant_pays",
    ac_type: null,
    apartment_conditions: [],
    property_type: "apartment_house",
    contact_name: profile?.full_name || "",
    contact_phone: profile?.phone || "",
    is_featured: false,
    broker_fee: false,
  });

  const [hasDraft, setHasDraft] = useState<boolean | null>(null);
  const hasInteractedRef = useRef(false);
  const startTrackedRef = useRef(false);

  // Load draft data on component mount
  useEffect(() => {
    loadDraftData().then(setHasDraft);
  }, []);

  // Load draft data when user logs in
  useEffect(() => {
    if (user) {
      loadDraftData().then(setHasDraft);
    }
  }, [user]);

  // Auto-save draft data when form changes (debounced)
  useEffect(() => {
    // Don't save if form is mostly empty
    if (!formData.title.trim() && !formData.location.trim()) {
      return;
    }

    const timeoutId = setTimeout(() => {
      // Save draft even if user is not logged in (use a temporary identifier)
      const identifier = user?.id || "anonymous";
      saveDraftData(identifier);
    }, 2000); // Save after 2 seconds of inactivity

    return () => clearTimeout(timeoutId);
  }, [formData, tempImages, user?.id]);

  // Track post start after first user interaction when no draft exists
  useEffect(() => {
    if (hasDraft === false && hasInteractedRef.current && !startTrackedRef.current) {
      trackPostStart();
      startTrackedRef.current = true;
    }
  }, [hasDraft]);

  // Track abandonment if user navigates away without completing post
  useEffect(() => {
    return () => {
      trackPostAbandoned();
    };
  }, []);

  // Update contact info when user profile loads
  useEffect(() => {
    if (profile) {
      setFormData((prev) => ({
        ...prev,
        contact_name: prev.contact_name || profile.full_name || "",
        contact_phone: prev.contact_phone || profile.phone || "",
      }));
    }
  }, [profile]);

  // Load user's owned agency if they have agency management permissions
  useEffect(() => {
    if (!user?.id || !profile) {
      setOwnedAgencyId(null);
      return;
    }

    if (profile.can_manage_agency || profile.is_admin) {
      agenciesService
        .getAgencyOwnedByProfile(user.id)
        .then((agency) => {
          setOwnedAgencyId(agency?.id || null);
        })
        .catch((error) => {
          console.error("Error loading owned agency:", error);
          setOwnedAgencyId(null);
        });
    } else {
      setOwnedAgencyId(null);
    }
  }, [user?.id, profile?.can_manage_agency, profile?.is_admin]);


  const loadDraftData = async (): Promise<boolean> => {
    try {
      let draftData: DraftData | null = null;

      // Load draft from localStorage (try user ID first, then anonymous)
      const identifier = user?.id || "anonymous";
      draftData = await draftListingsService.loadDraft(identifier);

      // If user just logged in and we have an anonymous draft, migrate it
      if (user?.id && !draftData) {
        const anonymousDraft =
          await draftListingsService.loadDraft("anonymous");
        if (anonymousDraft) {
          draftData = anonymousDraft;
          // Save to user's account and delete anonymous draft
          await draftListingsService.saveDraft(
            draftData,
            user.id,
            draftData.tempImages,
          );
          await draftListingsService.deleteDraft("anonymous");
        }
      }

      if (draftData) {
        // Restore form data
        setFormData({
          title: draftData.title || "",
          description: draftData.description || "",
          location: draftData.location || "",
          neighborhood: draftData.neighborhood || "",
          bedrooms: draftData.bedrooms || 1,
          bathrooms: draftData.bathrooms || 1,
          additional_rooms: (draftData as any).additional_rooms || null,
          floor: draftData.floor,
          price: draftData.call_for_price ? null : draftData.price ?? null,
          call_for_price: draftData.call_for_price ?? false,
          square_footage: draftData.square_footage,
          parking: draftData.parking || "no",
          washer_dryer_hookup: draftData.washer_dryer_hookup || false,
          dishwasher: draftData.dishwasher || false,
          lease_length: draftData.lease_length || null,
          heat: draftData.heat || "tenant_pays",
          ac_type: (draftData as any).ac_type || null,
          apartment_conditions: (draftData as any).apartment_conditions || [],
          property_type: draftData.property_type || "apartment_house",
          contact_name: draftData.contact_name || profile?.full_name || "",
          contact_phone: draftData.contact_phone || profile?.phone || "",
          is_featured: draftData.is_featured || false,
          broker_fee: false,
        });

        // Restore temp images if they exist
        if (draftData.tempImages && draftData.tempImages.length > 0) {
          setTempImages(draftData.tempImages);
        }

        // Check if using custom neighborhood
        const standardNeighborhoods = [
          "Midwood",
          "Homecrest",
          "Marine Park",
          "Flatbush",
          "Gravesend",
          "Boro Park",
        ];
        if (
          draftData.neighborhood &&
          !standardNeighborhoods.includes(draftData.neighborhood)
        ) {
          setShowCustomNeighborhood(true);
          setNeighborhoodSelectValue("other");
          setCustomNeighborhoodInput(draftData.neighborhood);
        } else {
          setShowCustomNeighborhood(false);
          setNeighborhoodSelectValue(draftData.neighborhood || "");
          setCustomNeighborhoodInput("");
        }

        console.log("✅ Draft data loaded successfully");
        return true;
      }
    } catch (error) {
      console.error("Error loading draft data:", error);
    }
    return false;
  };

  const saveDraftData = async (identifier: string) => {
    setSavingDraft(true);
    try {
      const draftData: DraftData = { ...formData, broker_fee: false };

      await draftListingsService.saveDraft(draftData, identifier, tempImages);
      console.log("✅ Draft saved automatically for:", identifier);
    } catch (error) {
      console.error("❌ Error saving draft for", identifier, ":", error);
      // Don't show alert for auto-save failures to avoid interrupting user experience
    } finally {
      setSavingDraft(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    const type = e.target.type;


    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      if (name === "broker_fee") {
        if (checked) {
          alert(
            "Listings with a tenant broker fee are not permitted on HaDirot. Please remove the fee to proceed.",
          );
        }
        setFormData((prev) => ({ ...prev, broker_fee: false }));
        return;
      }
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else if (type === "number") {
      const numValue = value === "" ? undefined : parseFloat(value);
      setFormData((prev) => ({ ...prev, [name]: numValue }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleNeighborhoodSelect = (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const value = e.target.value;
    setNeighborhoodSelectValue(value);
    if (value === "other") {
      setShowCustomNeighborhood(true);
      setFormData((prev) => ({ ...prev, neighborhood: customNeighborhoodInput }));
    } else {
      setShowCustomNeighborhood(false);
      setCustomNeighborhoodInput("");
      setFormData((prev) => ({ ...prev, neighborhood: value }));
    }
  };

  const handleCustomNeighborhoodChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = e.target.value;
    setCustomNeighborhoodInput(value);
    setFormData((prev) => ({ ...prev, neighborhood: value }));
  };

  const processFiles = async (files: File[]) => {
    handleFirstInteraction();

    if (!user) {
      alert("Please sign in to upload images");
      return;
    }

    if (tempImages.length + files.length > 10) {
      alert("Maximum 10 images allowed");
      return;
    }
    let hasFeatured = tempImages.some((img) => img.is_featured);

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        alert(`${file.name} is not an image file`);
        continue;
      }

      let fileToUpload: File = file;
      if (file.size > 8 * 1024 * 1024) {
        try {
          const compressed = await compressImage(file, {
            quality: 0.8,
            maxWidth: 1920,
          });
          if (compressed.size > 8 * 1024 * 1024) {
            alert(`${file.name} is too large even after compression (8MB limit)`);
            continue;
          }
          fileToUpload = new File([compressed],
            file.name.replace(/\.[^.]+$/, ".jpg"),
            { type: "image/jpeg" });
        } catch (err) {
          console.error("Error compressing image:", err);
          alert(`Failed to process ${file.name}`);
          continue;
        }
      }

      const tempId = `temp-${Date.now()}-${Math.random()}`;
      setUploadingImages((prev) => ({ ...prev, [tempId]: true }));

      try {
        const { filePath, publicUrl } =
          await listingsService.uploadTempListingImage(fileToUpload, user.id);

        const is_featured = !hasFeatured;
        if (!hasFeatured) {
          hasFeatured = true;
        }

        const tempImage: TempListingImage = {
          filePath,
          publicUrl,
          is_featured,
          originalName: file.name,
        };

        setTempImages((prev) => {
          const updated = is_featured
            ? prev.map((img) => ({ ...img, is_featured: false }))
            : [...prev];
          updated.push(tempImage);
          return updated;
        });
      } catch (error) {
        console.error("Error uploading temp image:", error);
        alert("Failed to upload image. Please try again.");
      } finally {
        setUploadingImages((prev) => {
          const newState = { ...prev };
          delete newState[tempId];
          return newState;
        });
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await processFiles(files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    await processFiles(files);
  };

  const removeImage = (index: number) => {
    handleFirstInteraction();
    setTempImages((prev) => {
      const newImages = prev.filter((_, i) => i !== index);
      // If we removed the featured image, make the first one featured
      if (prev[index]?.is_featured && newImages.length > 0) {
        newImages[0].is_featured = true;
      }
      return newImages;
    });
  };

  const setFeaturedImage = (index: number) => {
    handleFirstInteraction();
    setTempImages((prev) =>
      prev.map((img, i) => ({
        ...img,
        is_featured: i === index,
      })),
    );
  };

  const submitListingContent = async () => {
    if (!user) {
      console.error(
        "User is not authenticated when trying to submit listing content.",
      );
      return;
    }
    setLoading(true);
    try {
      const neighborhood =
        neighborhoodSelectValue === "other"
          ? customNeighborhoodInput.trim()
          : neighborhoodSelectValue;

    // Validate neighborhood is selected
    if (!neighborhood || neighborhood.trim() === "") {
      alert("Please select or enter a neighborhood");
      setLoading(false);
      return;
    }

    if (neighborhoodSelectValue === "other" && neighborhood === "") {
      alert("Please enter a neighborhood");
      setLoading(false);
      return;
    }

      if (formData.broker_fee) {
        alert(
          "Listings with a tenant broker fee are not permitted on HaDirot. Please remove the fee to proceed.",
        );
        setLoading(false);
        return;
      }

      // Track submission attempt only after validation passes
      trackPostSubmit();

      // Create the listing first
      const payload = {
        ...formData,
        broker_fee: false,
        neighborhood,
        user_id: user.id,
        agency_id: ownedAgencyId || null,
        is_active: false,
        approved: false,
        price: formData.call_for_price ? null : formData.price,
        call_for_price: !!formData.call_for_price,
      } as any;
      const listing = await listingsService.createListing(payload);

      // Track successful submission
      trackPostSuccess(listing.id);

      // Process images: upload local base64 images to draft bucket first, then finalize all images
      if (tempImages.length > 0) {
        await listingsService.finalizeTempListingImages(
          listing.id,
          user.id,
          tempImages,
        );
      }

      // Delete the draft since we've successfully created the listing
      try {
        await draftListingsService.deleteDraft(user.id);
        resetPostingState(); // Clear posting state after success
        console.log("✅ Draft deleted after successful listing creation");
      } catch (draftError) {
        console.error(
          "⚠️ Failed to delete draft after listing creation:",
          draftError,
        );
        // Don't block the flow if draft deletion fails
      }

      navigate(`/listing/${listing.id}`);

      // Send email notification to user
      try {
        const siteUrl = window.location.origin;
        const userName = profile?.full_name || "A user";
        const html = renderBrandEmail({
          title: "New Listing Posted",
          intro: `${userName} has posted a new listing.`,
          bodyHtml: `<p>View the listing here:</p>`,
          ctaLabel: "View Listing",
          ctaHref: `${siteUrl}/listing/${listing.id}`,
        });

        await emailService.sendEmail({
          to: user.email!,
          subject: `Listing Submitted: ${formData.title} - HaDirot`,
          html,
        });

        console.log("✅ Listing submission email sent successfully");
      } catch (emailError) {
        console.error(
          "⚠️ Failed to send listing submission email:",
          emailError,
        );
        // Don't block the user flow if email fails
      }
    } catch (error) {
      console.error("Error creating listing:", error);

      // Show specific error messages based on the error
      let errorMessage = "Failed to create listing. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes("permission")) {
          errorMessage =
            "You do not have permission to feature listings. Please contact support to upgrade your account.";
        } else if (error.message.includes("platform only allows")) {
          errorMessage = error.message;
        } else if (error.message.includes("You can only feature")) {
          errorMessage = error.message;
        }
      }

      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    handleFirstInteraction();

    if (loading) return;

    if (!user) {
      setShowAuthModal(true);
      return;
    }

    // If user is already logged in, proceed with submission
    await submitListingContent();
  };

  const handleAuthSuccess = async () => {
    setShowAuthModal(false);
    // User can now continue editing the form and add images
  };

  const handleFirstInteraction = () => {
    hasInteractedRef.current = true;
    ensurePostAttempt();
    if (hasDraft === false && !startTrackedRef.current) {
      trackPostStart();
      startTrackedRef.current = true;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#273140]">Post a Listing</h1>
        <p className="text-gray-600 mt-2">
          Share your property with potential tenants
          {!user && (
            <span className="block text-sm text-orange-600 mt-1">
              You'll need to sign in to publish your listing
            </span>
          )}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        onFocus={handleFirstInteraction}
        onChange={handleFirstInteraction}
        className="space-y-8"
      >
        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-[#273140] mb-4">
            Basic Information
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Property Title *
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                placeholder="Beautiful 2BR apartment in downtown"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                placeholder="Describe your property, amenities, and neighborhood..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cross Streets *
              </label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140] mb-2"
                placeholder="Main St & 1st Ave"
              />
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Neighborhood *
              </label>
              <select
                name="neighborhood"
                value={neighborhoodSelectValue}
                onChange={handleNeighborhoodSelect}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                required
              >
                <option value="">Select a neighborhood</option>
                <option value="Midwood">Midwood</option>
                <option value="Homecrest">Homecrest</option>
                <option value="Marine Park">Marine Park</option>
                <option value="Flatbush">Flatbush</option>
                <option value="Gravesend">Gravesend</option>
                <option value="Boro Park">Boro Park</option>
                <option value="other">Other (type below)</option>
              </select>
              {showCustomNeighborhood && (
                <input
                  type="text"
                  value={customNeighborhoodInput}
                  onChange={handleCustomNeighborhoodChange}
                  className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  placeholder="Enter custom neighborhood"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Property Type *
              </label>
              <select
                name="property_type"
                value={formData.property_type}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
              >
                <option value="apartment_building">
                  Apartment in a building
                </option>
                <option value="apartment_house">Apartment in a house</option>
                <option value="full_house">Full house</option>
                <option value="duplex">Duplex</option>
              </select>
            </div>
          </div>
        </div>

        {/* Property Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-[#273140] mb-4">
            Property Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bedrooms *
              </label>
              <select
                name="bedrooms"
                value={formData.bedrooms}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
              >
                <option value={0}>Studio</option>
                <option value={1}>1 Bedroom</option>
                <option value={2}>2 Bedrooms</option>
                <option value={3}>3 Bedrooms</option>
                <option value={4}>4 Bedrooms</option>
                <option value={5}>5 Bedrooms</option>
                <option value={6}>6 Bedrooms</option>
                <option value={7}>7 Bedrooms</option>
                <option value={8}>8+ Bedrooms</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional Rooms (Optional)
              </label>
              <select
                name="additional_rooms"
                value={formData.additional_rooms ?? ""}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
              >
                <option value="">None</option>
                <option value={1}>+1 Room</option>
                <option value={2}>+2 Rooms</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Extra rooms beyond bedrooms (e.g., office, den)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bathrooms *
              </label>
              <select
                name="bathrooms"
                value={formData.bathrooms}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
              >
                <option value={1}>1 Bathroom</option>
                <option value={1.5}>1.5 Bathrooms</option>
                <option value={2}>2 Bathrooms</option>
                <option value={2.5}>2.5 Bathrooms</option>
                <option value={3}>3 Bathrooms</option>
                <option value={3.5}>3.5 Bathrooms</option>
                <option value={4}>4+ Bathrooms</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Floor
              </label>
              <input
                type="number"
                name="floor"
                value={formData.floor || ""}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                placeholder="2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Monthly Rent ($) *
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={formData.price ?? ''}
                onChange={(e) =>
                  setFormData((f) => ({
                    ...f,
                    price: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                disabled={formData.call_for_price}
                required={!formData.call_for_price}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                placeholder="2500"
              />
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={formData.call_for_price}
                  onChange={(e) =>
                    setFormData((f) => ({
                      ...f,
                      call_for_price: e.target.checked,
                      price: e.target.checked ? null : f.price,
                    }))
                  }
                />
                <span>Call for Price</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Square Footage
              </label>
              <input
                type="number"
                name="square_footage"
                value={formData.square_footage || ""}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                placeholder="800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Lease Length
              </label>
              <select
                name="lease_length"
                value={formData.lease_length || ""}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
              >
                <option value="">Select lease length (optional)</option>
                <option value="short_term">Short Term</option>
                <option value="1_year">1 Year</option>
                <option value="18_months">18 Months</option>
                <option value="2_years">2 Years</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Parking
              </label>
              <select
                name="parking"
                value={formData.parking}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
              >
                <option value="no">No Parking</option>
                <option value="yes">Parking Available</option>
                <option value="included">Parking Included</option>
                <option value="optional">Optional Parking</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Heat
              </label>
              <select
                name="heat"
                value={formData.heat}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
              >
                <option value="tenant_pays">Tenant Pays</option>
                <option value="included">Heat Included</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                AC Type (Optional)
              </label>
              <select
                name="ac_type"
                value={formData.ac_type || ""}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
              >
                <option value="">Select AC type</option>
                <option value="central">Central</option>
                <option value="split_unit">Split Unit</option>
                <option value="window">Window</option>
              </select>
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Apartment Conditions (Optional)
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.apartment_conditions?.includes('modern') || false}
                  onChange={(e) => {
                    const conditions = formData.apartment_conditions || [];
                    if (e.target.checked) {
                      setFormData(prev => ({ ...prev, apartment_conditions: [...conditions, 'modern'] }));
                    } else {
                      setFormData(prev => ({ ...prev, apartment_conditions: conditions.filter(c => c !== 'modern') }));
                    }
                  }}
                  className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Modern</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.apartment_conditions?.includes('renovated') || false}
                  onChange={(e) => {
                    const conditions = formData.apartment_conditions || [];
                    if (e.target.checked) {
                      setFormData(prev => ({ ...prev, apartment_conditions: [...conditions, 'renovated'] }));
                    } else {
                      setFormData(prev => ({ ...prev, apartment_conditions: conditions.filter(c => c !== 'renovated') }));
                    }
                  }}
                  className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Renovated</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.apartment_conditions?.includes('large_rooms') || false}
                  onChange={(e) => {
                    const conditions = formData.apartment_conditions || [];
                    if (e.target.checked) {
                      setFormData(prev => ({ ...prev, apartment_conditions: [...conditions, 'large_rooms'] }));
                    } else {
                      setFormData(prev => ({ ...prev, apartment_conditions: conditions.filter(c => c !== 'large_rooms') }));
                    }
                  }}
                  className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Large Rooms</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.apartment_conditions?.includes('high_ceilings') || false}
                  onChange={(e) => {
                    const conditions = formData.apartment_conditions || [];
                    if (e.target.checked) {
                      setFormData(prev => ({ ...prev, apartment_conditions: [...conditions, 'high_ceilings'] }));
                    } else {
                      setFormData(prev => ({ ...prev, apartment_conditions: conditions.filter(c => c !== 'high_ceilings') }));
                    }
                  }}
                  className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">High Ceilings</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.apartment_conditions?.includes('large_closets') || false}
                  onChange={(e) => {
                    const conditions = formData.apartment_conditions || [];
                    if (e.target.checked) {
                      setFormData(prev => ({ ...prev, apartment_conditions: [...conditions, 'large_closets'] }));
                    } else {
                      setFormData(prev => ({ ...prev, apartment_conditions: conditions.filter(c => c !== 'large_closets') }));
                    }
                  }}
                  className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Large Closets</span>
              </label>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center">
              <input
                type="checkbox"
                name="washer_dryer_hookup"
                checked={formData.washer_dryer_hookup}
                onChange={handleInputChange}
                className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
              />
              <label className="ml-2 text-sm font-medium text-gray-700">
                Washer/Dryer Hookup
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                name="dishwasher"
                checked={formData.dishwasher}
                onChange={handleInputChange}
                className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
              />
              <label className="ml-2 text-sm font-medium text-gray-700">
                Dishwasher
              </label>
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="broker_fee"
                  checked={formData.broker_fee}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
                />
                <span className="text-sm font-medium text-gray-700">
                  Broker Fee
                </span>
              </label>
              <p className="text-xs text-gray-500">
                Check this if a broker fee applies.
              </p>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                name="is_featured"
                checked={formData.is_featured}
                onChange={handleInputChange}
                disabled={
                  !profile?.is_admin &&
                  (profile?.max_featured_listings_per_user ?? 0) <= 0
                }
                className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
              />
              <label
                className={`ml-2 text-sm font-medium flex items-center ${
                  !profile?.is_admin &&
                  (profile?.max_featured_listings_per_user ?? 0) <= 0
                    ? "text-gray-400"
                    : "text-gray-700"
                }`}
              >
                <Star className="w-4 h-4 mr-1 text-accent-600" />
                Feature this listing
                {!profile?.is_admin &&
                  (profile?.max_featured_listings_per_user ?? 0) <= 0 && (
                    <span className="ml-2 text-xs text-gray-400">
                      (Contact support to upgrade)
                    </span>
                  )}
              </label>
            </div>
          </div>
        </div>

        {/* Images */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-[#273140] mb-4">
            Images (Up to 10)
          </h2>

          <div className="mb-4">
            <label className="block w-full">
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#273140] transition-colors cursor-pointer"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                {Object.keys(uploadingImages).length > 0 ? (
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140] mx-auto mb-2"></div>
                ) : (
                  <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                )}
                <span className="text-sm text-gray-600">
                  {Object.keys(uploadingImages).length > 0
                    ? "Uploading..."
                    : "Click to upload images or drag and drop"}
                </span>
                <span className="text-xs text-gray-500 block mt-1">
                  PNG, JPG up to 8MB each
                </span>
              </div>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                disabled={
                  tempImages.length >= 10 ||
                  Object.keys(uploadingImages).length > 0 ||
                  !user
                }
              />
            </label>
          </div>

          {tempImages.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {tempImages.map((image, index) => (
                <div key={index} className="relative group">
                  <img
                    src={image.publicUrl}
                    alt={`Upload ${index + 1}`}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeaturedImage(index)}
                    className={`absolute bottom-2 left-2 px-2 py-1 rounded text-xs font-medium transition-colors ${
                      image.is_featured
                        ? "bg-accent-500 text-white"
                        : "bg-black bg-opacity-50 text-white hover:bg-accent-600"
                    }`}
                  >
                    {image.is_featured ? "Featured" : "Set Featured"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Auto-save indicator */}
          {savingDraft && (
            <div className="mt-4 flex items-center text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#273140] mr-2"></div>
              Saving draft...
            </div>
          )}

          {!user && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                Please sign in to upload images. Your form data will be saved
                automatically.
              </p>
            </div>
          )}

          <p className="mt-2 text-xs text-gray-500">
            If you don't upload photos, a tasteful stock photo will be shown on your public listing.
          </p>
        </div>

        {/* Contact Information */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-[#273140] mb-4">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
              />
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="bg-accent-500 text-white px-8 py-3 rounded-md font-semibold hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Creating Listing..." : "Post Listing"}
          </button>
        </div>
      </form>

      {/* Authentication Modal */}
      <Modal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title="Sign In or Sign Up to Post Listing"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Please sign in or create an account to publish your listing. Your
            draft will be saved automatically.
          </p>
          <AuthForm onAuthSuccess={handleAuthSuccess} />
        </div>
      </Modal>
    </div>
  );
}
