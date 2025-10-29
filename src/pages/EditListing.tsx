import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Upload, X, Star, ArrowLeft, Save } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { listingsService } from "../services/listings";
import { emailService } from "../services/email";
import {
  PropertyType,
  ParkingType,
  HeatType,
  LeaseLength,
  Listing,
  ListingImage,
  TempListingImage,
  ACType,
} from "../config/supabase";
import { compressImage } from "../utils/imageUtils";

interface ListingFormData {
  title: string;
  description: string;
  location: string;
  neighborhood: string;
  bedrooms: number;
  bathrooms: number;
  floor?: number;
  price: number | null;
  call_for_price: boolean;
  square_footage?: number;
  parking: ParkingType;
  washer_dryer_hookup: boolean;
  dishwasher: boolean;
  lease_length?: LeaseLength | null;
  heat: HeatType;
  property_type: PropertyType | '';
  contact_name: string;
  contact_phone: string;
  broker_fee: boolean;
  ac_type?: ACType | null;
  apartment_conditions: string[];
  additional_rooms: number;
}

interface ProcessedImage {
  id: string;
  url: string;
  is_featured: boolean;
  isExisting: boolean;
}

const SUPABASE_STORAGE_BASE_URL =
  "https://pxlxdlrjmrkxyygdhvku.supabase.co/storage/v1/object/public/listing-images/";

export function EditListing() {
  const { id } = useParams<{ id: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [existingImages, setExistingImages] = useState<ListingImage[]>([]);
  const [imagesToDelete, setImagesToDelete] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<TempListingImage[]>([]);
  const [neighborhoodSelectValue, setNeighborhoodSelectValue] = useState<string>("");
  const [showCustomNeighborhood, setShowCustomNeighborhood] = useState(false);
  const [customNeighborhoodInput, setCustomNeighborhoodInput] = useState("");
  const [formData, setFormData] = useState<ListingFormData>({
    title: "",
    description: "",
    location: "",
    neighborhood: "",
    bedrooms: 1,
    bathrooms: 1,
    floor: undefined,
    price: null,
    call_for_price: false,
    square_footage: undefined,
    parking: "no",
    washer_dryer_hookup: false,
    dishwasher: false,
    lease_length: null,
    heat: "tenant_pays",
    property_type: "apartment_house",
    contact_name: "",
    contact_phone: "",
    broker_fee: false,
    ac_type: null,
    apartment_conditions: [],
    additional_rooms: 0,
  });

  useEffect(() => {
    if (id) {
      loadListing();
    }
  }, [id]);

  // Ownership check
  useEffect(() => {
    if (!authLoading && !loading && user && listing) {
      if (user.id !== listing.user_id) {
        navigate("/dashboard");
      }
    }
  }, [authLoading, loading, user, listing, navigate]);

  const loadListing = async () => {
    if (!id) return;

    try {
      const data = await listingsService.getListing(id, user?.id);

      if (!data) {
        navigate("/dashboard");
        return;
      }

      setListing(data);
      setExistingImages(data.listing_images || []);

      // Pre-fill form data
      setFormData({
        title: data.title,
        description: data.description || "",
        location: data.location,
        neighborhood: data.neighborhood || "",
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        floor: data.floor || undefined,
        price: data.call_for_price ? null : data.price,
        call_for_price: !!data.call_for_price,
        square_footage: data.square_footage || undefined,
        parking: data.parking,
        washer_dryer_hookup: data.washer_dryer_hookup,
        dishwasher: data.dishwasher,
        lease_length: data.lease_length || null,
        heat: data.heat,
        property_type: data.property_type,
        contact_name: data.contact_name,
        contact_phone: data.contact_phone,
        broker_fee: false,
        ac_type: data.ac_type || null,
        apartment_conditions: data.apartment_conditions || [],
        additional_rooms: data.additional_rooms || 0,
      });
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
        data.neighborhood &&
        !standardNeighborhoods.includes(data.neighborhood)
      ) {
        setShowCustomNeighborhood(true);
        setNeighborhoodSelectValue("other");
        setCustomNeighborhoodInput(data.neighborhood);
      } else {
        setShowCustomNeighborhood(false);
        setNeighborhoodSelectValue(data.neighborhood || "");
        setCustomNeighborhoodInput("");
      }
    } catch (error) {
      console.error("Error loading listing:", error);
      navigate("/dashboard");
    } finally {
      setLoading(false);
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

  const handleMainBedroomChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      bedrooms: parseInt(value) || 0
    }));
  };

  const handleAdditionalRoomsChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      additional_rooms: value === "" ? 0 : parseInt(value) || 0
    }));
  };

  const handleApartmentConditionToggle = (condition: string) => {
    setFormData((prev) => {
      const current = prev.apartment_conditions || [];
      const isSelected = current.includes(condition);

      if (isSelected) {
        return {
          ...prev,
          apartment_conditions: current.filter(c => c !== condition)
        };
      } else {
        return {
          ...prev,
          apartment_conditions: [...current, condition]
        };
      }
    });
  };

  const processFiles = async (files: File[]) => {
    if (!user) {
      alert("Please sign in to upload images");
      return;
    }

    if (existingImages.length + newImages.length + files.length > 10) {
      alert("Maximum 10 images allowed");
      return;
    }

    let hasFeatured =
      existingImages.some((img) => img.is_featured) ||
      newImages.some((img) => img.is_featured);

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
          fileToUpload = new File(
            [compressed],
            file.name.replace(/\.[^.]+$/, ".jpg"),
            { type: "image/jpeg" },
          );
        } catch (err) {
          console.error("Error compressing image:", err);
          alert(`Failed to process ${file.name}`);
          continue;
        }
      }

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

        setNewImages((prev) => {
          const updated = is_featured
            ? prev.map((img) => ({ ...img, is_featured: false }))
            : [...prev];
          updated.push(tempImage);
          return updated;
        });
      } catch (error) {
        console.error("Error uploading temp image:", error);
        alert("Failed to upload image. Please try again.");
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

  const removeNewImage = (index: number) => {
    setNewImages((prev) => {
      const newImages = prev.filter((_, i) => i !== index);
      // If we removed the featured image, make the first one featured
      if (
        prev[index]?.is_featured &&
        newImages.length > 0 &&
        existingImages.length === 0
      ) {
        newImages[0].is_featured = true;
      }
      return newImages;
    });
  };

  const removeExistingImage = async (imageId: string, imageUrl: string) => {
    // Mark image for deletion instead of deleting immediately
    setImagesToDelete((prev) => [...prev, imageId]);

    // If we're removing the featured image, make the first remaining image featured
    const removedImage = existingImages.find((img) => img.id === imageId);
    if (removedImage?.is_featured) {
      const remainingImages = existingImages.filter(
        (img) => img.id !== imageId && !imagesToDelete.includes(img.id),
      );
      if (remainingImages.length > 0) {
        setExistingImages((prev) =>
          prev.map((img) => ({
            ...img,
            is_featured: img.id === remainingImages[0].id,
          })),
        );
      } else if (newImages.length > 0) {
        // Make first new image featured if no existing images remain
        setNewImages((prev) =>
          prev.map((img, i) => ({ ...img, is_featured: i === 0 })),
        );
      }
    }
  };

  const setFeaturedExistingImage = async (imageId: string) => {
    // Update local state immediately
    setExistingImages((prev) =>
      prev.map((img) => ({
        ...img,
        is_featured: img.id === imageId,
      })),
    );

    // Make sure no new images are featured
    setNewImages((prev) => prev.map((img) => ({ ...img, is_featured: false })));
  };

  const setFeaturedNewImage = (index: number) => {
    // Update new images
    setNewImages((prev) =>
      prev.map((img, i) => ({
        ...img,
        is_featured: i === index,
      })),
    );

    // Make sure no existing images are featured
    setExistingImages((prev) =>
      prev.map((img) => ({ ...img, is_featured: false })),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !id) {
      alert("Please sign in to edit this listing.");
      return;
    }

    setSaving(true);
    try {
      const neighborhood =
        neighborhoodSelectValue === "other"
          ? customNeighborhoodInput.trim()
          : neighborhoodSelectValue;

      if (!neighborhood || neighborhood === "") {
        alert("Please select or enter a neighborhood");
        setSaving(false);
        return;
      }

      if (neighborhoodSelectValue === "other" && neighborhood === "") {
        alert("Please enter a neighborhood");
        setSaving(false);
        return;
      }

      if (!formData.property_type || formData.property_type === "") {
        alert("Please select a property type");
        setSaving(false);
        return;
      }

      if (formData.broker_fee) {
        alert(
          "Listings with a tenant broker fee are not permitted on HaDirot. Please remove the fee to proceed.",
        );
        setSaving(false);
        return;
      }

      // Delete marked images first
      for (const imageId of imagesToDelete) {
        const imageToDelete = existingImages.find((img) => img.id === imageId);
        if (imageToDelete) {
          await listingsService.deleteListingImage(
            imageId,
            imageToDelete.image_url,
          );
        }
      }

      // Update featured status for remaining existing images
      const remainingImages = existingImages.filter(
        (img) => !imagesToDelete.includes(img.id),
      );
      for (const image of remainingImages) {
        await listingsService.updateListingImage(image.id, {
          is_featured: image.is_featured,
        });
      }

      // Update the listing
      await listingsService.updateListing(id, {
        ...formData,
        broker_fee: false,
        neighborhood,
        updated_at: new Date().toISOString(),
        price: formData.call_for_price ? null : formData.price,
        call_for_price: !!formData.call_for_price,
        ac_type: formData.ac_type || null,
        apartment_conditions: formData.apartment_conditions.length > 0 ? formData.apartment_conditions : null,
        additional_rooms: formData.additional_rooms > 0 ? formData.additional_rooms : null,
      } as any);

      // Upload new images
      if (newImages.length > 0) {
        await listingsService.finalizeTempListingImages(id, user.id, newImages);
      }

      navigate(`/listing/${id}`);

      // Send email notification to user
      try {
        if (user?.email && profile?.full_name) {
          await emailService.sendListingUpdatedEmail(
            user.email,
            profile.full_name,
            formData.title,
          );
          console.log("✅ Email sent: listing update to", user.email);
        }
      } catch (emailError) {
        console.error("❌ Email failed: listing update -", emailError.message);
        // Don't block the user flow if email fails
      }
    } catch (error) {
      console.error("Error updating listing:", error);

      // Show specific error messages based on the error
      let errorMessage = "Failed to update listing. Please try again.";
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
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4E4B43] mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading listing...</p>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-8">
          <p className="text-gray-600">Listing not found or access denied.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <Link
          to="/dashboard"
          className="inline-flex items-center text-[#273140] hover:text-[#1e252f] mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-[#273140]">Edit Listing</h1>
        <p className="text-gray-600 mt-2">Update your property details</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
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
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
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
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
              >
                <option value="">Select Property Type</option>
                <option value="apartment_building">
                  Apartment in a building
                </option>
                <option value="apartment_house">Apartment in a house</option>
                <option value="duplex">Duplex</option>
                <option value="full_house">Full house</option>
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
                onChange={(e) => handleMainBedroomChange(e.target.value)}
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
                Additional Rooms (optional)
              </label>
              <select
                name="additional_rooms"
                value={formData.additional_rooms || ""}
                onChange={(e) => handleAdditionalRoomsChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
              >
                <option value="">None</option>
                <option value={1}>+1</option>
                <option value={2}>+2</option>
                <option value={3}>+3</option>
                <option value={4}>+4</option>
              </select>
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

            {/* Square Footage - Hidden but kept for future use */}
            <div style={{ display: 'none' }}>
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
                AC Type
              </label>
              <select
                name="ac_type"
                value={formData.ac_type || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, ac_type: e.target.value as ACType || null }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
              >
                <option value="">Select AC Type (optional)</option>
                <option value="central">Central AC</option>
                <option value="split_unit">Split Unit AC</option>
                <option value="window">Window AC</option>
              </select>
            </div>
          </div>

          {/* Apartment Conditions */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Apartment Conditions
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.apartment_conditions.includes('modern')}
                  onChange={() => handleApartmentConditionToggle('modern')}
                  className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">Modern</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.apartment_conditions.includes('renovated')}
                  onChange={() => handleApartmentConditionToggle('renovated')}
                  className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">Renovated</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.apartment_conditions.includes('large_rooms')}
                  onChange={() => handleApartmentConditionToggle('large_rooms')}
                  className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">Large Rooms</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.apartment_conditions.includes('high_ceilings')}
                  onChange={() => handleApartmentConditionToggle('high_ceilings')}
                  className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">High Ceilings</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.apartment_conditions.includes('large_closets')}
                  onChange={() => handleApartmentConditionToggle('large_closets')}
                  className="h-4 w-4 text-[#273140] focus:ring-[#273140] border-gray-300 rounded"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">Large Closets</span>
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
          </div>
        </div>

        {/* Images */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-[#273140] mb-4">
            Images (Up to 10)
          </h2>

          {/* Existing Images */}
          {existingImages.filter((img) => !imagesToDelete.includes(img.id))
            .length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                Current Images
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {existingImages
                  .filter((img) => !imagesToDelete.includes(img.id))
                  .map((image) => (
                    <div key={image.id} className="relative group">
                      <img
                        src={image.image_url}
                        alt={listing?.title}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          removeExistingImage(image.id, image.image_url)
                        }
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeaturedExistingImage(image.id)}
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
            </div>
          )}

          {/* New Images */}
          {newImages.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                New Images
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {newImages.map((image, index) => (
                  <div key={`new-${index}`} className="relative group">
                    <img
                      src={image.publicUrl}
                      alt={`New upload ${index + 1}`}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => removeNewImage(index)}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeaturedNewImage(index)}
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
            </div>
          )}

          {/* Upload New Images */}
          <div className="mb-4">
            <label className="block w-full">
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#273140] transition-colors cursor-pointer"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <span className="text-sm text-gray-600">
                  Click to upload new images or drag and drop
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
                  existingImages.filter(
                    (img) => !imagesToDelete.includes(img.id),
                  ).length +
                    newImages.length >=
                    10 || !user
                }
              />
            </label>

            {!user && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800">
                  Please sign in to upload images.
                </p>
              </div>
            )}

            <p className="mt-2 text-xs text-gray-500">
              If you don't upload photos, a tasteful stock photo will be shown on your public listing.
            </p>
          </div>
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
        <div className="flex justify-end space-x-4">
          <Link
            to="/dashboard"
            className="px-8 py-3 border border-gray-300 rounded-md font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="bg-accent-500 text-white px-8 py-3 rounded-md font-semibold hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}