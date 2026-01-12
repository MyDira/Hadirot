import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Upload, X, Star, ArrowLeft, Save } from "lucide-react";
import * as Sentry from "@sentry/react";
import { useAuth } from "@/hooks/useAuth";
import { listingsService, getExpirationDate } from "../services/listings";
import { emailService } from "../services/email";
import { reverseGeocode } from "../services/reverseGeocode";
import { generateVideoThumbnail } from "../utils/videoUtils";
import { MediaUploader, MediaFile } from "../components/shared/MediaUploader";
import { LocationPicker } from "../components/listing/LocationPicker";
import { MapboxStreetAutocomplete, MapboxFeature } from "../components/listing/MapboxStreetAutocomplete";
import { UserSearchSelect } from "../components/admin/UserSearchSelect";
import { profilesService } from "../services/profiles";
import {
  Profile,
  PropertyType,
  ParkingType,
  HeatType,
  LeaseLength,
  Listing,
  ListingImage,
  TempListingImage,
  ACType,
  PropertyCondition,
  OccupancyStatus,
  DeliveryCondition,
  BasementType,
  LaundryType,
  HeatingType,
  BuildingType,
  RentRollUnit,
  SaleStatus,
} from "../config/supabase";
import { SalesListingFields } from "../components/listing/SalesListingFields";
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
  listing_type: 'rental' | 'sale';
  sale_status: SaleStatus | null;
  asking_price: number | null;
  building_type?: BuildingType | null;
  property_condition?: PropertyCondition | null;
  occupancy_status?: OccupancyStatus | null;
  delivery_condition?: DeliveryCondition | null;
  lot_size_sqft?: number | null;
  lot_size_input_mode: 'sqft' | 'dimensions';
  property_length_ft?: number | null;
  property_width_ft?: number | null;
  building_size_sqft?: number | null;
  building_size_input_mode: 'sqft' | 'dimensions';
  building_length_ft?: number | null;
  building_width_ft?: number | null;
  number_of_floors?: number | null;
  year_built?: number | null;
  year_renovated?: number | null;
  hoa_fees?: number | null;
  property_taxes?: number | null;
  outdoor_space?: string[];
  interior_features?: string[];
  laundry_type?: LaundryType | null;
  basement_type?: BasementType | null;
  basement_notes?: string | null;
  heating_type?: HeatingType | null;
  rent_roll_total?: number | null;
  rent_roll_data?: RentRollUnit[];
  utilities_included?: string[];
  tenant_notes?: string | null;
  street_address?: string | null;
  unit_number?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  unit_count?: number | null;
}

interface ProcessedImage {
  id: string;
  url: string;
  is_featured: boolean;
  isExisting: boolean;
}

const SUPABASE_STORAGE_BASE_URL =
  "https://pxlxdlrjmrkxyygdhvku.supabase.co/storage/v1/object/public/listing-images/";

function parseFullAddress(fullAddress: string | null | undefined): {
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
} {
  const defaults = {
    street_address: '',
    city: 'Brooklyn',
    state: 'NY',
    zip_code: '',
  };

  if (!fullAddress || typeof fullAddress !== 'string') {
    return defaults;
  }

  const parts = fullAddress.split(',').map(part => part.trim());

  if (parts.length >= 4) {
    return {
      street_address: parts[0] || '',
      city: parts[1] || 'Brooklyn',
      state: parts[2] || 'NY',
      zip_code: parts[3] || '',
    };
  } else if (parts.length === 3) {
    return {
      street_address: parts[0] || '',
      city: parts[1] || 'Brooklyn',
      state: 'NY',
      zip_code: parts[2] || '',
    };
  } else if (parts.length === 2) {
    return {
      street_address: parts[0] || '',
      city: parts[1] || 'Brooklyn',
      state: 'NY',
      zip_code: '',
    };
  } else if (parts.length === 1) {
    return {
      street_address: parts[0] || '',
      city: 'Brooklyn',
      state: 'NY',
      zip_code: '',
    };
  }

  return defaults;
}

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
  const [adminAssignUser, setAdminAssignUser] = useState<Profile | null>(null);
  const [adminCustomAgencyName, setAdminCustomAgencyName] = useState('');
  const [adminListingTypeDisplay, setAdminListingTypeDisplay] = useState<'agent' | 'owner' | ''>('');
  const [crossStreetAFeature, setCrossStreetAFeature] = useState<MapboxFeature | null>(null);
  const [crossStreetBFeature, setCrossStreetBFeature] = useState<MapboxFeature | null>(null);
  const [isLocationConfirmed, setIsLocationConfirmed] = useState(true);
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
    listing_type: 'rental',
    sale_status: null,
    asking_price: null,
    building_type: null,
    property_condition: null,
    occupancy_status: null,
    delivery_condition: null,
    lot_size_sqft: null,
    lot_size_input_mode: 'sqft',
    property_length_ft: null,
    property_width_ft: null,
    building_size_sqft: null,
    building_size_input_mode: 'sqft',
    building_length_ft: null,
    building_width_ft: null,
    number_of_floors: null,
    year_built: null,
    year_renovated: null,
    hoa_fees: null,
    property_taxes: null,
    outdoor_space: [],
    interior_features: [],
    laundry_type: null,
    basement_type: null,
    basement_notes: null,
    heating_type: null,
    rent_roll_total: null,
    rent_roll_data: [],
    utilities_included: [],
    tenant_notes: null,
    street_address: null,
    unit_number: null,
    city: null,
    state: null,
    zip_code: null,
    unit_count: null,
  });

  const isSaleListing = formData.listing_type === 'sale';

  useEffect(() => {
    if (id) {
      loadListing();
    }
  }, [id]);

  // Ownership check - allow admins to bypass
  useEffect(() => {
    if (!authLoading && !loading && user && listing && profile) {
      const isOwner = user.id === listing.user_id;
      const isAdmin = profile.is_admin;
      if (!isOwner && !isAdmin) {
        navigate("/dashboard");
      }
    }
  }, [authLoading, loading, user, listing, profile, navigate]);

  // Load admin fields when editing as admin
  useEffect(() => {
    if (profile?.is_admin && listing) {
      setAdminCustomAgencyName(listing.admin_custom_agency_name || '');
      setAdminListingTypeDisplay(listing.admin_listing_type_display || '');
      // Load the assigned user if it's different from current user
      if (listing.user_id && listing.user_id !== user?.id) {
        profilesService.getProfile(listing.user_id).then((assignedProfile) => {
          if (assignedProfile) {
            setAdminAssignUser(assignedProfile);
          }
        });
      }
    }
  }, [profile?.is_admin, listing, user?.id]);

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
      // For sale listings, parse address components from full_address
      const isSaleListingData = data.listing_type === 'sale';
      const parsedAddress = isSaleListingData ? parseFullAddress(data.full_address) : null;

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
        listing_type: data.listing_type || 'rental',
        sale_status: (data.sale_status as SaleStatus) || null,
        asking_price: data.asking_price || null,
        building_type: data.building_type || null,
        property_condition: data.property_condition || null,
        occupancy_status: data.occupancy_status || null,
        delivery_condition: data.delivery_condition || null,
        lot_size_sqft: data.lot_size_sqft || null,
        lot_size_input_mode: 'sqft',
        property_length_ft: null,
        property_width_ft: null,
        building_size_sqft: data.building_size_sqft || null,
        building_size_input_mode: 'sqft',
        building_length_ft: null,
        building_width_ft: null,
        number_of_floors: data.number_of_floors || null,
        year_built: data.year_built || null,
        year_renovated: data.year_renovated || null,
        hoa_fees: data.hoa_fees || null,
        property_taxes: data.property_taxes || null,
        outdoor_space: data.outdoor_space || [],
        interior_features: data.interior_features || [],
        laundry_type: data.laundry_type || null,
        basement_type: data.basement_type || null,
        basement_notes: data.basement_notes || null,
        heating_type: data.heating_type || null,
        rent_roll_total: data.rent_roll_total || null,
        rent_roll_data: data.rent_roll_data || [],
        utilities_included: data.utilities_included || [],
        tenant_notes: data.tenant_notes || null,
        street_address: parsedAddress?.street_address || null,
        unit_number: null,
        city: parsedAddress?.city || data.city || null,
        state: parsedAddress?.state || 'NY',
        zip_code: parsedAddress?.zip_code || data.zip_code || null,
        unit_count: data.unit_count || null,
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

  const handleOutdoorSpaceToggle = (space: string) => {
    setFormData((prev) => {
      const current = prev.outdoor_space || [];
      const isSelected = current.includes(space);
      if (isSelected) {
        return { ...prev, outdoor_space: current.filter(s => s !== space) };
      } else {
        return { ...prev, outdoor_space: [...current, space] };
      }
    });
  };

  const handleInteriorFeatureToggle = (feature: string) => {
    setFormData((prev) => {
      const current = prev.interior_features || [];
      const isSelected = current.includes(feature);
      if (isSelected) {
        return { ...prev, interior_features: current.filter(f => f !== feature) };
      } else {
        return { ...prev, interior_features: [...current, feature] };
      }
    });
  };

  const handleApplianceToggle = (appliance: string) => {
    setFormData((prev) => {
      const current = prev.apartment_conditions || [];
      const isSelected = current.includes(appliance);
      if (isSelected) {
        return { ...prev, apartment_conditions: current.filter(a => a !== appliance) };
      } else {
        return { ...prev, apartment_conditions: [...current, appliance] };
      }
    });
  };

  const handleUtilityToggle = (utility: string) => {
    setFormData((prev) => {
      const current = prev.utilities_included || [];
      const isSelected = current.includes(utility);
      if (isSelected) {
        return { ...prev, utilities_included: current.filter(u => u !== utility) };
      } else {
        return { ...prev, utilities_included: [...current, utility] };
      }
    });
  };

  const handleRentRollUnitChange = (index: number, field: keyof RentRollUnit, value: string | number) => {
    setFormData((prev) => {
      const newData = [...(prev.rent_roll_data || [])];
      newData[index] = { ...newData[index], [field]: value };
      return { ...prev, rent_roll_data: newData };
    });
  };

  const addRentRollUnit = () => {
    setFormData((prev) => ({
      ...prev,
      rent_roll_data: [...(prev.rent_roll_data || []), { unit: '', bedrooms: 0, rent: 0 }]
    }));
  };

  const removeRentRollUnit = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      rent_roll_data: (prev.rent_roll_data || []).filter((_, i) => i !== index)
    }));
  };

  const handleLotSizeModeChange = (mode: 'sqft' | 'dimensions') => {
    setFormData((prev) => ({ ...prev, lot_size_input_mode: mode }));
  };

  const calculateLotSize = (): number | null => {
    if (formData.lot_size_input_mode === 'dimensions' && formData.property_length_ft && formData.property_width_ft) {
      return Math.round(formData.property_length_ft * formData.property_width_ft);
    }
    return formData.lot_size_sqft || null;
  };

  const handleBuildingSizeModeChange = (mode: 'sqft' | 'dimensions') => {
    setFormData((prev) => ({ ...prev, building_size_input_mode: mode }));
  };

  const calculateBuildingSize = (): number | null => {
    if (formData.building_size_input_mode === 'dimensions' && formData.building_length_ft && formData.building_width_ft) {
      return Math.round(formData.building_length_ft * formData.building_width_ft);
    }
    return formData.building_size_sqft || null;
  };

  const handleLocationCoordinatesChange = (lat: number | null, lng: number | null) => {
    setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }));
  };

  const handleNeighborhoodFromMap = (detectedNeighborhood: string) => {
    const presetNeighborhoods = ["Midwood", "Homecrest", "Marine Park", "Flatbush", "Gravesend", "Boro Park"];
    const matchedPreset = presetNeighborhoods.find(
      (n) => n.toLowerCase() === detectedNeighborhood.toLowerCase()
    );

    if (matchedPreset) {
      setNeighborhoodSelectValue(matchedPreset);
      setShowCustomNeighborhood(false);
      setCustomNeighborhoodInput("");
      setFormData((prev) => ({ ...prev, neighborhood: matchedPreset }));
    } else {
      setNeighborhoodSelectValue("other");
      setShowCustomNeighborhood(true);
      setCustomNeighborhoodInput(detectedNeighborhood);
      setFormData((prev) => ({ ...prev, neighborhood: detectedNeighborhood }));
    }
  };

  const handleConfirmationStatusChange = (confirmed: boolean) => {
    setIsLocationConfirmed(confirmed);
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
      // For rental listings, get neighborhood from form
      // For sale listings, it will be derived from coordinates at submission time
      const neighborhood =
        !isSaleListing
          ? (neighborhoodSelectValue === "other"
            ? customNeighborhoodInput.trim()
            : neighborhoodSelectValue)
          : '';

      // Validate neighborhood only for rental listings
      if (!isSaleListing) {
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
      }

      // Validate address fields for sales listings
      if (isSaleListing) {
        if (!formData.street_address || formData.street_address.trim() === "") {
          alert("Please enter a street address");
          setSaving(false);
          return;
        }

        if (!formData.city || formData.city.trim() === "") {
          alert("Please enter a city");
          setSaving(false);
          return;
        }

        if (!formData.state || formData.state.trim() === "") {
          alert("Please enter a state");
          setSaving(false);
          return;
        }

        if (!formData.zip_code || formData.zip_code.trim() === "") {
          alert("Please enter a ZIP code");
          setSaving(false);
          return;
        }
      }

      if (!formData.property_type || formData.property_type === "") {
        alert("Please select a property type");
        setSaving(false);
        return;
      }

      if (formData.latitude && formData.longitude && !isLocationConfirmed) {
        alert("Please confirm the map location before saving. Open the map modal and click 'Confirm Location'.");
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

      // Handle admin assignment - determine new user_id if changed
      const previousUserId = listing?.user_id;
      const newUserId = (profile?.is_admin && adminAssignUser) ? adminAssignUser.id : previousUserId;
      const userIdChanged = previousUserId !== newUserId;

      // For sale listings, derive neighborhood from coordinates if they changed
      let finalNeighborhood = neighborhood;
      if (isSaleListing && formData.latitude && formData.longitude) {
        const coordsChanged = listing?.latitude !== formData.latitude || listing?.longitude !== formData.longitude;
        if (coordsChanged) {
          try {
            const geoResult = await reverseGeocode(formData.latitude, formData.longitude);
            if (geoResult.neighborhood) {
              finalNeighborhood = geoResult.neighborhood;
              console.log('✅ Auto-derived neighborhood for sale listing:', finalNeighborhood);
            } else {
              console.log('⚠️ Could not derive neighborhood from coordinates');
              finalNeighborhood = listing?.neighborhood || null;
            }
          } catch (error) {
            console.error('Error reverse geocoding for neighborhood:', error);
            finalNeighborhood = listing?.neighborhood || null;
          }
        } else {
          // Coordinates haven't changed, preserve existing neighborhood
          finalNeighborhood = listing?.neighborhood || null;
        }
      }

      // Prepare update payload
      const updatePayload: any = {
        title: formData.title,
        description: formData.description,
        location: formData.location,
        cross_street_a: crossStreetAFeature?.text || null,
        cross_street_b: crossStreetBFeature?.text || null,
        neighborhood: finalNeighborhood,
        bedrooms: formData.bedrooms,
        bathrooms: formData.bathrooms,
        floor: formData.floor,
        parking: formData.parking,
        washer_dryer_hookup: formData.washer_dryer_hookup,
        dishwasher: formData.dishwasher,
        heat: formData.heat,
        property_type: formData.property_type,
        contact_name: formData.contact_name,
        contact_phone: formData.contact_phone,
        broker_fee: false,
        updated_at: new Date().toISOString(),
        ac_type: formData.ac_type || null,
        apartment_conditions: formData.apartment_conditions.length > 0 ? formData.apartment_conditions : null,
        additional_rooms: formData.additional_rooms > 0 ? formData.additional_rooms : null,
        latitude: formData.latitude,
        longitude: formData.longitude,
      };

      // Add admin fields if user is admin
      if (profile?.is_admin) {
        // Ensure listing remains approved when admin edits
        updatePayload.approved = true;
        if (adminAssignUser) {
          updatePayload.user_id = adminAssignUser.id;
          updatePayload.admin_custom_agency_name = null;
          updatePayload.admin_listing_type_display = null;
        } else {
          updatePayload.admin_custom_agency_name = adminCustomAgencyName.trim() || null;
          updatePayload.admin_listing_type_display = adminListingTypeDisplay || null;
        }
      }

      if (isSaleListing) {
        const calculatedLotSize = calculateLotSize();
        const calculatedBuildingSize = calculateBuildingSize();

        // Build full address string for sales listings
        const addressParts = [
          formData.street_address,
          formData.unit_number ? `Unit ${formData.unit_number}` : '',
          formData.city || 'Brooklyn',
          formData.state || 'NY',
          formData.zip_code || ''
        ].filter(Boolean);
        const fullAddress = addressParts.join(', ');

        const saleStatusChanged = formData.sale_status !== (listing?.sale_status || 'available');
        const newExpiresAt = saleStatusChanged
          ? getExpirationDate('sale', formData.sale_status || 'available').toISOString()
          : undefined;

        Object.assign(updatePayload, {
          asking_price: formData.call_for_price ? null : formData.asking_price,
          call_for_price: !!formData.call_for_price,
          sale_status: formData.sale_status || 'available',
          ...(newExpiresAt && { expires_at: newExpiresAt }),
          building_type: formData.building_type || null,
          property_condition: formData.property_condition || null,
          occupancy_status: formData.occupancy_status || null,
          delivery_condition: formData.delivery_condition || null,
          lot_size_sqft: calculatedLotSize,
          building_size_sqft: calculatedBuildingSize,
          number_of_floors: formData.number_of_floors || null,
          year_built: formData.year_built || null,
          year_renovated: formData.year_renovated || null,
          hoa_fees: formData.hoa_fees || null,
          property_taxes: formData.property_taxes || null,
          outdoor_space: formData.outdoor_space && formData.outdoor_space.length > 0 ? formData.outdoor_space : null,
          interior_features: formData.interior_features && formData.interior_features.length > 0 ? formData.interior_features : null,
          laundry_type: formData.laundry_type || null,
          basement_type: formData.basement_type || null,
          basement_notes: formData.basement_notes || null,
          heating_type: formData.heating_type || null,
          rent_roll_total: formData.rent_roll_total || null,
          rent_roll_data: formData.rent_roll_data && formData.rent_roll_data.length > 0 ? formData.rent_roll_data : null,
          utilities_included: formData.utilities_included && formData.utilities_included.length > 0 ? formData.utilities_included : null,
          tenant_notes: formData.tenant_notes || null,
          city: formData.city || null,
          zip_code: formData.zip_code || null,
          unit_count: formData.unit_count || null,
          full_address: fullAddress,
        });
      } else {
        Object.assign(updatePayload, {
          price: formData.call_for_price ? null : formData.price,
          call_for_price: !!formData.call_for_price,
          lease_length: formData.lease_length || null,
          square_footage: formData.square_footage || null,
        });
      }

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

      // Send email notifications
      try {
        // If admin reassigned listing to another user, notify them
        if (profile?.is_admin && userIdChanged && adminAssignUser?.email) {
          const { renderBrandEmail, emailService: es } = await import('../services/email');
          const siteUrl = window.location.origin;
          const assignedHtml = renderBrandEmail({
            title: "Listing Assigned to You",
            intro: `A listing has been assigned to your account by an administrator.`,
            bodyHtml: `<p><strong>Listing:</strong> ${formData.title}</p><p>You can view and manage this listing from your dashboard.</p>`,
            ctaLabel: "View Listing",
            ctaHref: `${siteUrl}/listing/${id}`,
          });

          await es.sendEmail({
            to: adminAssignUser.email,
            subject: `Listing Assigned: ${formData.title} - HaDirot`,
            html: assignedHtml,
          });

          console.log("✅ Listing assignment email sent to user:", adminAssignUser.email);
        }

        // Send regular update notification to current user
        if (user?.email && profile?.full_name) {
          await emailService.sendListingUpdatedEmail(
            user.email,
            profile.full_name,
            formData.title,
          );
          console.log("✅ Email sent: listing update to", user.email);
        }
      } catch (emailError: any) {
        console.error("❌ Email failed: listing update -", emailError?.message);
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
            user_role: profile?.role || 'unknown',
            is_admin: profile?.is_admin || false,
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
        {/* Admin Listing Assignment - Only visible to admins */}
        {profile?.is_admin && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-brand-600 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0">
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-brand-50 text-brand-700 text-xs font-medium">
                  Admin Only
                </div>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-brand-700 mb-1">
                  Listing Assignment
                </h2>
                <p className="text-sm text-gray-600">
                  Reassign this listing to another user or customize display settings
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign to User
                </label>
                <UserSearchSelect
                  selectedUser={adminAssignUser}
                  onSelect={setAdminAssignUser}
                  placeholder="Search users by name, email, or agency..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty to keep the listing under your admin account with custom display settings below.
                </p>
              </div>

              {!adminAssignUser && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Custom Agency/Poster Name
                    </label>
                    <input
                      type="text"
                      value={adminCustomAgencyName}
                      onChange={(e) => setAdminCustomAgencyName(e.target.value.slice(0, 100))}
                      maxLength={100}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
                      placeholder="Enter agency or poster name to display"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This name will appear on listing cards. Max 100 characters.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Listing Type Display
                    </label>
                    <select
                      value={adminListingTypeDisplay}
                      onChange={(e) => setAdminListingTypeDisplay(e.target.value as 'agent' | 'owner' | '')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
                    >
                      <option value="">Select display type</option>
                      <option value="agent">Real Estate Agent</option>
                      <option value="owner">By Owner</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

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

            {/* Listing Type - Display Only (Cannot be changed during edit) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Listing Type
              </label>
              <div className="flex items-center h-10 px-3 py-2 bg-gray-50 border border-gray-300 rounded-md">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  isSaleListing
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-green-100 text-green-800'
                }`}>
                  {isSaleListing ? 'For Sale' : 'For Rent'}
                </span>
                <span className="ml-3 text-sm text-gray-500">
                  (Cannot be changed)
                </span>
              </div>
            </div>

            {/* Location fields - different for rental vs sale listings */}
            {isSaleListing ? (
              <>
                {/* Sales Listing: Full Address Fields */}
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Street Address *
                  </label>
                  <input
                    type="text"
                    name="street_address"
                    value={formData.street_address || ""}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                    placeholder="123 Main Street"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit/Apt #
                  </label>
                  <input
                    type="text"
                    name="unit_number"
                    value={formData.unit_number || ""}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ZIP Code *
                  </label>
                  <input
                    type="text"
                    name="zip_code"
                    value={formData.zip_code || ""}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                    placeholder="11201"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city || ""}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                    placeholder="Brooklyn"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State *
                  </label>
                  <input
                    type="text"
                    name="state"
                    value={formData.state || ""}
                    onChange={handleInputChange}
                    required
                    maxLength={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                    placeholder="NY"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Set Location on Map *
                  </label>
                  <p className="text-sm text-gray-500 mb-3">
                    Use "Find on Map" or "Set Pin Location" to geocode your property
                  </p>
                  <LocationPicker
                    crossStreets={`${formData.street_address || ''}, ${formData.city || ''}, ${formData.state || ''}`}
                    neighborhood={formData.neighborhood}
                    latitude={formData.latitude}
                    longitude={formData.longitude}
                    onLocationChange={handleLocationCoordinatesChange}
                    onNeighborhoodChange={handleNeighborhoodFromMap}
                    onConfirmationStatusChange={handleConfirmationStatusChange}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Rental Listing: Cross Streets + Neighborhood */}
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cross Streets *
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Please enter two exact street names
                  </p>
                  <div className="space-y-3 mb-4">
                    <MapboxStreetAutocomplete
                      value={crossStreetAFeature?.text}
                      onSelect={(feature) => {
                        setCrossStreetAFeature(feature);
                        if (feature) {
                          setFormData(prev => ({ ...prev, location: `${feature.text} & ${crossStreetBFeature?.text || ''}`.trim() }));
                        }
                      }}
                      placeholder="First cross street (e.g., Avenue J)"
                    />
                    <MapboxStreetAutocomplete
                      value={crossStreetBFeature?.text}
                      onSelect={(feature) => {
                        setCrossStreetBFeature(feature);
                        if (feature) {
                          setFormData(prev => ({ ...prev, location: `${crossStreetAFeature?.text || ''} & ${feature.text}`.trim() }));
                        }
                      }}
                      placeholder="Second cross street (e.g., East 15th Street)"
                    />
                  </div>
                  <div className="mt-4 mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Set Location on Map (optional)
                    </label>
                    <p className="text-sm text-gray-500 mb-3">
                      Help tenants find your listing by setting its location on the map.
                    </p>
                    <LocationPicker
                      crossStreets={formData.location}
                      crossStreetAFeature={crossStreetAFeature}
                      crossStreetBFeature={crossStreetBFeature}
                      neighborhood={formData.neighborhood}
                      city={formData.city}
                      latitude={formData.latitude}
                      longitude={formData.longitude}
                      onLocationChange={handleLocationCoordinatesChange}
                      onNeighborhoodChange={handleNeighborhoodFromMap}
                      onConfirmationStatusChange={handleConfirmationStatusChange}
                    />
                  </div>
                </div>

                {/* Neighborhood field - only for rental listings */}
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
              </>
            )}

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
                {isSaleListing ? (
                  <>
                    <option value="single_family">Single-Family</option>
                    <option value="two_family">Two-Family</option>
                    <option value="three_family">Three-Family</option>
                    <option value="four_family">Four-Family</option>
                    <option value="condo">Condo</option>
                    <option value="co_op">Co-op</option>
                  </>
                ) : (
                  <>
                    <option value="apartment_building">Apartment in a building</option>
                    <option value="apartment_house">Apartment in a house</option>
                    <option value="basement">Basement</option>
                    <option value="duplex">Duplex</option>
                    <option value="full_house">Full house</option>
                  </>
                )}
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
                {isSaleListing ? 'Asking Price ($) *' : 'Monthly Rent ($) *'}
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={isSaleListing ? (formData.asking_price ?? '') : (formData.price ?? '')}
                onChange={(e) =>
                  setFormData((f) => ({
                    ...f,
                    ...(isSaleListing
                      ? { asking_price: e.target.value ? Number(e.target.value) : null }
                      : { price: e.target.value ? Number(e.target.value) : null }),
                  }))
                }
                disabled={formData.call_for_price}
                required={!formData.call_for_price}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                placeholder={isSaleListing ? "950000" : "2500"}
              />
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={formData.call_for_price}
                  onChange={(e) =>
                    setFormData((f) => ({
                      ...f,
                      call_for_price: e.target.checked,
                      ...(isSaleListing
                        ? { asking_price: e.target.checked ? null : f.asking_price }
                        : { price: e.target.checked ? null : f.price }),
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

            {!isSaleListing && (
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
                  <option value="long_term_annual">Long Term/Annual</option>
                  <option value="summer_rental">Summer Rental</option>
                  <option value="winter_rental">Winter Rental</option>
                </select>
              </div>
            )}

            {isSaleListing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Building Type *
                </label>
                <select
                  name="building_type"
                  value={formData.building_type || ""}
                  onChange={(e) => setFormData(prev => ({ ...prev, building_type: e.target.value as BuildingType || null }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                >
                  <option value="">Select Building Type</option>
                  <option value="detached">Detached</option>
                  <option value="semi_attached">Semi-Attached</option>
                  <option value="fully_attached">Fully Attached</option>
                  <option value="apartment">Apartment</option>
                </select>
              </div>
            )}

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

            {!isSaleListing && (
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
            )}

            {!isSaleListing && (
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
            )}
          </div>

          {/* Apartment Conditions - Rental Only */}
          {!isSaleListing && (
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
          )}

          {/* Additional Rental Features */}
          {!isSaleListing && (
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
          )}
        </div>

        {/* Sale Status Selector */}
        {isSaleListing && listing?.is_active && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-[#273140] mb-4">
              Sale Status
            </h2>
            <div className="max-w-sm">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Status
              </label>
              <select
                name="sale_status"
                value={formData.sale_status || 'available'}
                onChange={(e) => {
                  const newStatus = e.target.value as SaleStatus;
                  if (newStatus === 'sold') {
                    if (!confirm('Marking as "Sold" means this listing cannot be extended. It will remain visible for 30 days. Continue?')) {
                      return;
                    }
                  }
                  setFormData(prev => ({ ...prev, sale_status: newStatus }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
              >
                <option value="available">Available</option>
                <option value="pending">Pending</option>
                <option value="in_contract">In Contract</option>
                <option value="sold">Sold</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {formData.sale_status === 'available' && 'Listing stays active for 14 days.'}
                {formData.sale_status === 'pending' && 'Listing stays active for 14 days.'}
                {formData.sale_status === 'in_contract' && 'Listing stays active for 6 weeks.'}
                {formData.sale_status === 'sold' && 'Listing stays visible for 30 days. Extensions not allowed.'}
              </p>
            </div>
          </div>
        )}

        {/* Sales Listing Fields */}
        {isSaleListing && (
          <SalesListingFields
            formData={formData}
            handleInputChange={handleInputChange}
            handleOutdoorSpaceToggle={handleOutdoorSpaceToggle}
            handleInteriorFeatureToggle={handleInteriorFeatureToggle}
            handleApplianceToggle={handleApplianceToggle}
            handleUtilityToggle={handleUtilityToggle}
            handleRentRollUnitChange={handleRentRollUnitChange}
            addRentRollUnit={addRentRollUnit}
            removeRentRollUnit={removeRentRollUnit}
            handleLotSizeModeChange={handleLotSizeModeChange}
            calculateLotSize={calculateLotSize}
            handleBuildingSizeModeChange={handleBuildingSizeModeChange}
            calculateBuildingSize={calculateBuildingSize}
          />
        )}

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