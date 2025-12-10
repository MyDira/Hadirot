import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Upload, X, Star, ArrowLeft, Save } from "lucide-react";
import * as Sentry from "@sentry/react";
import { useAuth } from "@/hooks/useAuth";
import { listingsService } from "../services/listings";
import { emailService } from "../services/email";
import { generateVideoThumbnail } from "../utils/videoUtils";
import { MediaUploader, MediaFile } from "../components/shared/MediaUploader";
import { LocationPicker } from "../components/listing/LocationPicker";
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
  latitude: number | null;
  longitude: number | null;
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
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [mediaToDelete, setMediaToDelete] = useState<string[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
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
    latitude: null,
    longitude: null,
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

      // Load existing media (images and video)
      const loadedMedia: MediaFile[] = [];

      // Load existing images
      if (data.listing_images && data.listing_images.length > 0) {
        data.listing_images.forEach((img) => {
          loadedMedia.push({
            id: img.id,
            type: 'image',
            url: img.image_url,
            is_featured: img.is_featured,
            isExisting: true
          });
        });
      }

      // Load existing video if present
      if (data.video_url) {
        loadedMedia.push({
          id: 'existing-video',
          type: 'video',
          url: data.video_url,
          is_featured: false,
          isExisting: true
        });
      }

      setMediaFiles(loadedMedia);

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
        latitude: data.latitude || null,
        longitude: data.longitude || null,
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

  const handleLocationCoordinatesChange = (lat: number | null, lng: number | null) => {
    setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }));
  };

  const handleMediaAdd = async (files: File[]) => {
    if (!user) {
      alert("Please sign in to upload media");
      return;
    }

    if (mediaFiles.length + files.length > 11) {
      alert("Maximum 11 files allowed (images + videos)");
      return;
    }

    const imageCount = mediaFiles.filter(m => m.type === 'image').length;
    const videoCount = mediaFiles.filter(m => m.type === 'video').length;

    setUploadingMedia(true);

    try {
      let hasFeatured = mediaFiles.some((m) => m.is_featured);
      const newMedia: MediaFile[] = [];

      for (const file of files) {
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");

        if (!isImage && !isVideo) {
          alert(`${file.name} is not a supported file type`);
          continue;
        }

        if (isVideo) {
          if (videoCount + newMedia.filter(m => m.type === 'video').length >= 1) {
            alert("Maximum 1 video allowed");
            continue;
          }

          if (file.size > 100 * 1024 * 1024) {
            alert(`${file.name} is too large. Maximum video size is 100MB`);
            continue;
          }

          const videoUrl = URL.createObjectURL(file);
          newMedia.push({
            id: `video-${Date.now()}-${Math.random()}`,
            type: 'video',
            file,
            url: videoUrl,
            is_featured: false,
            originalName: file.name
          });
        } else if (isImage) {
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

          try {
            const { filePath, publicUrl } =
              await listingsService.uploadTempListingImage(fileToUpload, user.id);

            const is_featured = !hasFeatured;
            if (!hasFeatured) {
              hasFeatured = true;
            }

            newMedia.push({
              id: `img-${Date.now()}-${Math.random()}`,
              type: 'image',
              url: publicUrl,
              filePath,
              publicUrl,
              is_featured,
              originalName: file.name
            });
          } catch (error) {
            console.error("Error uploading temp image:", error);
            alert(`Failed to upload ${file.name}. Please try again.`);
          }
        }
      }

      if (newMedia.length > 0) {
        setMediaFiles((prev) => {
          const updated = hasFeatured
            ? prev.map((m) => ({ ...m, is_featured: false }))
            : [...prev];
          return [...updated, ...newMedia];
        });
      }
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleMediaRemove = (id: string) => {
    const mediaToRemove = mediaFiles.find(m => m.id === id);

    if (mediaToRemove) {
      // If it's an existing media item, mark it for deletion
      if (mediaToRemove.isExisting) {
        setMediaToDelete((prev) => [...prev, id]);
      }

      // If it's a video with a blob URL, revoke it
      if (mediaToRemove.type === 'video' && mediaToRemove.url.startsWith('blob:')) {
        URL.revokeObjectURL(mediaToRemove.url);
      }
    }

    setMediaFiles((prev) => {
      const newMedia = prev.filter(m => m.id !== id);
      // If we removed the featured image, make the first image featured
      if (mediaToRemove?.is_featured && newMedia.length > 0) {
        const firstImage = newMedia.find(m => m.type === 'image');
        if (firstImage) {
          return newMedia.map(m => ({
            ...m,
            is_featured: m.id === firstImage.id
          }));
        }
      }
      return newMedia;
    });
  };

  const handleSetFeatured = (id: string) => {
    setMediaFiles((prev) =>
      prev.map((m) => ({
        ...m,
        is_featured: m.id === id && m.type === 'image',
      })),
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

      // Process media deletions
      const existingImageIds = listing?.listing_images?.map(img => img.id) || [];
      for (const mediaId of mediaToDelete) {
        if (existingImageIds.includes(mediaId)) {
          // Delete existing image
          const imageToDelete = listing?.listing_images?.find(img => img.id === mediaId);
          if (imageToDelete) {
            await listingsService.deleteListingImage(mediaId, imageToDelete.image_url);
          }
        } else if (mediaId === 'existing-video') {
          // Clear video URL
          await listingsService.updateListing(id, { video_url: null });
        }
      }

      // Process media updates
      const existingImages = mediaFiles.filter(m => m.type === 'image' && m.isExisting);
      const newImageMedia = mediaFiles.filter(m => m.type === 'image' && !m.isExisting);
      const videoMedia = mediaFiles.find(m => m.type === 'video' && !m.isExisting);

      // Update featured status for existing images
      for (const media of existingImages) {
        await listingsService.updateListingImage(media.id, {
          is_featured: media.is_featured,
        });
      }

      // Prepare update payload
      const updatePayload: any = {
        ...formData,
        broker_fee: false,
        neighborhood,
        updated_at: new Date().toISOString(),
        price: formData.call_for_price ? null : formData.price,
        call_for_price: !!formData.call_for_price,
        ac_type: formData.ac_type || null,
        apartment_conditions: formData.apartment_conditions.length > 0 ? formData.apartment_conditions : null,
        additional_rooms: formData.additional_rooms > 0 ? formData.additional_rooms : null,
        latitude: formData.latitude,
        longitude: formData.longitude,
      };

      // Update the listing
      await listingsService.updateListing(id, updatePayload);

      // Upload new images
      if (newImageMedia.length > 0) {
        const tempImages = newImageMedia.map(m => ({
          filePath: m.filePath!,
          publicUrl: m.publicUrl || m.url,
          is_featured: m.is_featured,
          originalName: m.originalName || ''
        }));
        await listingsService.finalizeTempListingImages(id, user.id, tempImages);
      }

      // Upload new video
      if (videoMedia && videoMedia.file) {
        try {
          setUploadingMedia(true);
          console.log("🎥 Starting video upload process...");

          const videoUrl = await listingsService.uploadListingVideo(
            videoMedia.file,
            id
          );

          console.log("✅ Video uploaded successfully:", videoUrl);

          // If no images exist after processing, generate and upload video thumbnail
          const hasImages = mediaFiles.filter(m => m.type === 'image' && !mediaToDelete.includes(m.id)).length > 0;
          if (!hasImages) {
            console.log("📸 No images detected, generating video thumbnail...");
            try {
              const thumbnailBlob = await generateVideoThumbnail(videoMedia.file);
              console.log("✅ Thumbnail blob generated, size:", thumbnailBlob.size);

              const thumbnailFile = new File(
                [thumbnailBlob],
                `thumbnail_${id}.jpg`,
                { type: 'image/jpeg' }
              );

              // Upload thumbnail as listing image
              console.log("📤 Uploading thumbnail to storage...");
              const thumbnailUrl = await listingsService.uploadListingImage(
                thumbnailFile,
                id
              );
              console.log("✅ Thumbnail uploaded to storage:", thumbnailUrl);

              // Add thumbnail to listing_images table
              console.log("💾 Adding thumbnail to listing_images table...");
              await listingsService.addListingImage(
                id,
                thumbnailUrl,
                true, // Set as featured
                0 // Sort order
              );
              console.log("✅ Thumbnail added to listing_images table");

              // Update listing with both video_url and video_thumbnail_url
              console.log("💾 Updating listing with video URLs...");
              await listingsService.updateListing(id, {
                video_url: videoUrl,
                video_thumbnail_url: thumbnailUrl,
              });
              console.log("✅ Listing updated with video and thumbnail URLs");

            } catch (thumbnailError) {
              console.error("❌ Failed to generate/upload video thumbnail:", thumbnailError);
              if (thumbnailError instanceof Error) {
                console.error("❌ Error details:", {
                  message: thumbnailError.message,
                  stack: thumbnailError.stack
                });
              }

              // Still update listing with video URL even if thumbnail fails
              await listingsService.updateListing(id, {
                video_url: videoUrl,
              });

              alert("Video uploaded successfully, but thumbnail generation failed. A stock photo will be used on listing cards.");
            }
          } else {
            // Images exist, just update video URL
            await listingsService.updateListing(id, {
              video_url: videoUrl,
            });
            console.log("✅ Listing updated with video URL (images already exist)");
          }
        } catch (videoError) {
          console.error("❌ Failed to upload video:", videoError);
          if (videoError instanceof Error) {
            console.error("❌ Error details:", {
              message: videoError.message,
              stack: videoError.stack
            });
          }
          alert("Failed to upload video. Please try again or contact support if the issue persists.");
          // Don't block the flow if video upload fails
        } finally {
          setUploadingMedia(false);
        }
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

      // Capture error in Sentry with full context
      Sentry.captureException(error, {
        tags: {
          error_source: 'listing_update',
          error_type: error instanceof Error && error.message.includes('constraint') ? 'database_constraint' : 'listing_update_failed',
          has_constraint_violation: error instanceof Error && error.message.includes('check constraint') ? 'true' : 'false',
          listing_id: id,
        },
        contexts: {
          form_data: {
            bedrooms: formData.bedrooms,
            additional_rooms: formData.additional_rooms,
            bathrooms: formData.bathrooms,
            property_type: formData.property_type,
            neighborhood: formData.neighborhood,
            parking: formData.parking,
            lease_length: formData.lease_length,
            is_featured: formData.is_featured,
            call_for_price: formData.call_for_price,
            has_price: formData.price !== null,
            ac_type: formData.ac_type,
            has_apartment_conditions: formData.apartment_conditions.length > 0,
          },
          user_context: {
            user_role: userRole,
            is_owner: listing?.user_id === user?.id,
          },
        },
        extra: {
          error_details: error instanceof Error ? {
            message: error.message,
            name: error.name,
          } : { raw_error: String(error) },
          listing_id: id,
        },
      });

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
        } else if (error.message.includes("check constraint") || error.message.includes("constraint")) {
          errorMessage = "There was an issue with the listing data. Please check all fields and try again.";
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

            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cross Streets *
              </label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140] mb-4"
                placeholder="Avenue J & East 15th Street"
              />
              <div className="mt-4 mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Set Location on Map (optional)
                </label>
                <p className="text-sm text-gray-500 mb-3">
                  Help tenants find your listing by setting its location on the map.
                </p>
                <LocationPicker
                  crossStreets={formData.location}
                  latitude={formData.latitude}
                  longitude={formData.longitude}
                  onLocationChange={handleLocationCoordinatesChange}
                />
              </div>
            </div>

            <div>
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
                <option value="basement">Basement</option>
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

        {/* Media Upload (Images & Videos) */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-[#273140] mb-4">
            Media (Images & Video)
          </h2>

          <MediaUploader
            mediaFiles={mediaFiles.filter(m => !mediaToDelete.includes(m.id))}
            onMediaAdd={handleMediaAdd}
            onMediaRemove={handleMediaRemove}
            onSetFeatured={handleSetFeatured}
            maxFiles={11}
            disabled={!user}
            uploading={uploadingMedia}
            showAuthWarning={!user}
          />
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