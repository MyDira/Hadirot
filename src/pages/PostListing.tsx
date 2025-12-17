import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Upload, X, Star } from "lucide-react";
import * as Sentry from "@sentry/react";
import { useAuth } from "@/hooks/useAuth";
import { listingsService } from "../services/listings";
import { emailService, renderBrandEmail } from "../services/email";
import { draftListingsService, DraftData, TempVideoData } from "../services/draftListings";
import { agenciesService } from "../services/agencies";
import { salesService } from "../services/sales";
import { Modal } from "../components/shared/Modal";
import { AuthForm } from "../components/auth/AuthForm";
import { compressImage } from "../utils/imageUtils";
import { generateVideoThumbnail } from "../utils/videoUtils";
import { MediaUploader, MediaFile } from "../components/shared/MediaUploader";
import { SalesListingFields } from "../components/listing/SalesListingFields";
import { LocationPicker } from "../components/listing/LocationPicker";
import { UserSearchSelect } from "../components/admin/UserSearchSelect";
import type { Profile } from "../config/supabase";
import { gaEvent } from "@/lib/ga";
import {
  ensurePostAttempt,
  trackPostStart,
  trackPostSubmit,
  trackPostSuccess,
  trackPostAbandoned,
  trackPostError,
  resetPostingState,
} from "../lib/analytics";
import {
  PropertyType,
  ParkingType,
  HeatType,
  LeaseLength,
  TempListingImage,
  ACType,
  ListingType,
  PropertyCondition,
  OccupancyStatus,
  DeliveryCondition,
  BasementType,
  LaundryType,
  BuildingType,
  RentRollUnit,
  HeatingType,
} from "../config/supabase";

interface ListingFormData {
  listing_type: ListingType | '';
  title: string;
  description: string;
  location: string;
  neighborhood: string;
  bedrooms: number;
  bathrooms: number;
  floor?: number;
  price: number | null;
  call_for_price: boolean;
  asking_price?: number | null;
  property_age?: number | null;
  year_built?: number | null;
  year_renovated?: number | null;
  hoa_fees?: number | null;
  property_taxes?: number | null;
  lot_size_sqft?: number | null;
  property_length_ft?: number | null;
  property_width_ft?: number | null;
  square_footage?: number;
  building_size_sqft?: number | null;
  building_length_ft?: number | null;
  building_width_ft?: number | null;
  unit_count?: number | null;
  number_of_floors?: number | null;
  parking: ParkingType;
  washer_dryer_hookup: boolean;
  dishwasher: boolean;
  lease_length?: LeaseLength | null;
  heat: HeatType;
  heating_type?: HeatingType | null;
  property_type: PropertyType | '';
  building_type?: BuildingType | '';
  contact_name: string;
  contact_phone: string;
  is_featured: boolean;
  broker_fee: boolean;
  ac_type?: ACType | null;
  apartment_conditions: string[];
  additional_rooms: number;
  property_condition?: PropertyCondition | '';
  occupancy_status?: OccupancyStatus | '';
  delivery_condition?: DeliveryCondition | '';
  outdoor_space: string[];
  interior_features: string[];
  laundry_type?: LaundryType | '';
  basement_type?: BasementType | '';
  basement_notes?: string;
  rent_roll_total?: number | null;
  rent_roll_data: RentRollUnit[];
  utilities_included: string[];
  tenant_notes?: string;
  street_address?: string;
  unit_number?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  lot_size_input_mode: 'sqft' | 'dimensions';
  building_size_input_mode: 'sqft' | 'dimensions';
  terms_agreed: boolean;
  latitude: number | null;
  longitude: number | null;
}

export function PostListing() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const userRole = profile?.role;
  const [loading, setLoading] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [neighborhoodSelectValue, setNeighborhoodSelectValue] = useState<string>("");
  const [showCustomNeighborhood, setShowCustomNeighborhood] = useState(false);
  const [customNeighborhoodInput, setCustomNeighborhoodInput] = useState("");
  const [ownedAgencyId, setOwnedAgencyId] = useState<string | null>(null);
  const [salesFeatureEnabled, setSalesFeatureEnabled] = useState(false);
  const [canPostSales, setCanPostSales] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionRequestMessage, setPermissionRequestMessage] = useState('');
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [adminAssignUser, setAdminAssignUser] = useState<Profile | null>(null);
  const [adminCustomAgencyName, setAdminCustomAgencyName] = useState('');
  const [adminListingTypeDisplay, setAdminListingTypeDisplay] = useState<'agent' | 'owner' | ''>('');
  const [formData, setFormData] = useState<ListingFormData>({
    listing_type: "",
    title: "",
    description: "",
    location: "",
    neighborhood: "",
    bedrooms: 1,
    bathrooms: 1,
    floor: undefined,
    price: null,
    call_for_price: false,
    asking_price: null,
    property_age: undefined,
    year_built: undefined,
    year_renovated: undefined,
    hoa_fees: undefined,
    property_taxes: undefined,
    lot_size_sqft: undefined,
    property_length_ft: undefined,
    property_width_ft: undefined,
    square_footage: undefined,
    building_size_sqft: undefined,
    building_length_ft: undefined,
    building_width_ft: undefined,
    unit_count: undefined,
    number_of_floors: undefined,
    parking: "no",
    washer_dryer_hookup: false,
    dishwasher: false,
    lease_length: null,
    heat: "tenant_pays",
    heating_type: null,
    property_type: "",
    building_type: "",
    contact_name: profile?.full_name || "",
    contact_phone: profile?.phone || "",
    is_featured: false,
    broker_fee: false,
    ac_type: null,
    apartment_conditions: [],
    additional_rooms: 0,
    property_condition: "",
    occupancy_status: "",
    delivery_condition: "",
    outdoor_space: [],
    interior_features: [],
    laundry_type: "",
    basement_type: "",
    basement_notes: "",
    rent_roll_total: null,
    rent_roll_data: [],
    utilities_included: [],
    tenant_notes: "",
    street_address: "",
    unit_number: "",
    city: "Brooklyn",
    state: "NY",
    zip_code: "",
    lot_size_input_mode: 'sqft',
    building_size_input_mode: 'sqft',
    terms_agreed: false,
    latitude: null,
    longitude: null,
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
  }, [formData, mediaFiles, user?.id]);

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

  // Load sales feature status on component mount
  useEffect(() => {
    salesService.isSalesFeatureEnabled().then(setSalesFeatureEnabled);
  }, []);

  // Check if user can post sales listings when user changes
  useEffect(() => {
    if (!user?.id) {
      setCanPostSales(false);
      return;
    }

    salesService.canUserPostSales(user.id).then(setCanPostSales);
  }, [user?.id]);

  // Validate price when listing type changes
  useEffect(() => {
    if (formData.listing_type && !formData.call_for_price) {
      if (formData.listing_type === 'rental') {
        if (!formData.price || formData.price <= 0) {
          setPriceError("Please enter a valid monthly rent greater than $0");
        } else {
          setPriceError(null);
        }
      } else if (formData.listing_type === 'sale') {
        if (!formData.asking_price || formData.asking_price <= 0) {
          setPriceError("Please enter a valid asking price greater than $0");
        } else {
          setPriceError(null);
        }
      }
    } else {
      setPriceError(null);
    }
  }, [formData.listing_type]);

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
            draftData.tempVideo
          );
          await draftListingsService.deleteDraft("anonymous");
        }
      }

      if (draftData) {
        // Restore form data - use spread to keep default values for missing fields
        setFormData(prev => ({
          ...prev,
          title: draftData.title || "",
          description: draftData.description || "",
          location: draftData.location || "",
          neighborhood: draftData.neighborhood || "",
          bedrooms: draftData.bedrooms || 1,
          bathrooms: draftData.bathrooms || 1,
          floor: draftData.floor,
          price: draftData.call_for_price ? null : draftData.price ?? null,
          call_for_price: draftData.call_for_price ?? false,
          square_footage: draftData.square_footage,
          parking: draftData.parking || "no",
          washer_dryer_hookup: draftData.washer_dryer_hookup || false,
          dishwasher: draftData.dishwasher || false,
          lease_length: draftData.lease_length || null,
          heat: draftData.heat || "tenant_pays",
          property_type: draftData.property_type || "apartment_house",
          contact_name: draftData.contact_name || profile?.full_name || "",
          contact_phone: draftData.contact_phone || profile?.phone || "",
          is_featured: draftData.is_featured || false,
          broker_fee: false,
          ac_type: (draftData as any).ac_type || null,
          apartment_conditions: (draftData as any).apartment_conditions || [],
          additional_rooms: (draftData as any).additional_rooms || 0,
          listing_type: (draftData as any).listing_type || "rental",
          asking_price: (draftData as any).asking_price || null,
          property_age: (draftData as any).property_age,
          year_built: (draftData as any).year_built,
          year_renovated: (draftData as any).year_renovated,
          hoa_fees: (draftData as any).hoa_fees,
          property_taxes: (draftData as any).property_taxes,
          lot_size_sqft: (draftData as any).lot_size_sqft,
          property_length_ft: (draftData as any).property_length_ft,
          property_width_ft: (draftData as any).property_width_ft,
          building_size_sqft: (draftData as any).building_size_sqft,
          building_length_ft: (draftData as any).building_length_ft,
          building_width_ft: (draftData as any).building_width_ft,
          unit_count: (draftData as any).unit_count,
          number_of_floors: (draftData as any).number_of_floors,
          heating_type: (draftData as any).heating_type || null,
          property_condition: (draftData as any).property_condition || "",
          occupancy_status: (draftData as any).occupancy_status || "",
          delivery_condition: (draftData as any).delivery_condition || "",
          outdoor_space: (draftData as any).outdoor_space || [],
          interior_features: (draftData as any).interior_features || [],
          laundry_type: (draftData as any).laundry_type || "",
          basement_type: (draftData as any).basement_type || "",
          basement_notes: (draftData as any).basement_notes || "",
          building_type: (draftData as any).building_type || "",
          rent_roll_total: (draftData as any).rent_roll_total || null,
          rent_roll_data: (draftData as any).rent_roll_data || [],
          utilities_included: (draftData as any).utilities_included || [],
          tenant_notes: (draftData as any).tenant_notes || "",
          street_address: (draftData as any).street_address || "",
          unit_number: (draftData as any).unit_number || "",
          city: (draftData as any).city || "",
          state: (draftData as any).state || "",
          zip_code: (draftData as any).zip_code || "",
          lot_size_input_mode: (draftData as any).lot_size_input_mode || 'sqft',
          building_size_input_mode: (draftData as any).building_size_input_mode || 'sqft',
          latitude: (draftData as any).latitude || null,
          longitude: (draftData as any).longitude || null,
        }));

        // Restore media files (images and video) if they exist
        const restoredMedia: MediaFile[] = [];
        if (draftData.tempImages && draftData.tempImages.length > 0) {
          draftData.tempImages.forEach((img, index) => {
            restoredMedia.push({
              id: `img-${index}`,
              type: 'image',
              url: img.publicUrl,
              filePath: img.filePath,
              publicUrl: img.publicUrl,
              is_featured: img.is_featured,
              originalName: img.originalName
            });
          });
        }
        if (draftData.tempVideo) {
          restoredMedia.push({
            id: `video-0`,
            type: 'video',
            url: draftData.tempVideo.url,
            is_featured: false,
            originalName: draftData.tempVideo.fileName
          });
        }
        setMediaFiles(restoredMedia);

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

        const restoredListingType = (draftData as any).listing_type || "rental";
        const restoredCallForPrice = draftData.call_for_price ?? false;
        const restoredPrice = draftData.call_for_price ? null : draftData.price ?? null;
        const restoredAskingPrice = (draftData as any).asking_price || null;

        if (restoredListingType && !restoredCallForPrice) {
          if (restoredListingType === 'rental' && (!restoredPrice || restoredPrice <= 0)) {
            setPriceError("Please enter a valid monthly rent greater than $0");
          } else if (restoredListingType === 'sale' && (!restoredAskingPrice || restoredAskingPrice <= 0)) {
            setPriceError("Please enter a valid asking price greater than $0");
          }
        }

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

      // Extract temp images from media files
      const tempImages = mediaFiles
        .filter(m => m.type === 'image' && m.filePath)
        .map(m => ({
          filePath: m.filePath!,
          publicUrl: m.publicUrl || m.url,
          is_featured: m.is_featured,
          originalName: m.originalName || ''
        }));

      // Extract temp video from media files
      const videoMedia = mediaFiles.find(m => m.type === 'video');
      const tempVideo: TempVideoData | undefined = videoMedia ? {
        url: videoMedia.url,
        fileName: videoMedia.originalName || 'video.mp4'
      } : undefined;

      await draftListingsService.saveDraft(draftData, identifier, tempImages, tempVideo);
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
      return {
        ...prev,
        outdoor_space: isSelected ? current.filter(s => s !== space) : [...current, space]
      };
    });
  };

  const handleInteriorFeatureToggle = (feature: string) => {
    setFormData((prev) => {
      const current = prev.interior_features || [];
      const isSelected = current.includes(feature);
      return {
        ...prev,
        interior_features: isSelected ? current.filter(f => f !== feature) : [...current, feature]
      };
    });
  };

  const handleApplianceToggle = (appliance: string) => {
    setFormData((prev) => {
      const current = prev.apartment_conditions || [];
      const isSelected = current.includes(appliance);
      return {
        ...prev,
        apartment_conditions: isSelected ? current.filter(a => a !== appliance) : [...current, appliance]
      };
    });
  };

  const handleUtilityToggle = (utility: string) => {
    setFormData((prev) => {
      const current = prev.utilities_included || [];
      const isSelected = current.includes(utility);
      return {
        ...prev,
        utilities_included: isSelected ? current.filter(u => u !== utility) : [...current, utility]
      };
    });
  };

  const handleRentRollUnitChange = (index: number, field: keyof RentRollUnit, value: string | number) => {
    setFormData((prev) => {
      const newRentRoll = [...(prev.rent_roll_data || [])];
      newRentRoll[index] = { ...newRentRoll[index], [field]: value };
      return { ...prev, rent_roll_data: newRentRoll };
    });
  };

  const addRentRollUnit = () => {
    setFormData((prev) => ({
      ...prev,
      rent_roll_data: [...(prev.rent_roll_data || []), { unit: '', bedrooms: 1, rent: 0 }]
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

  const calculateLotSize = () => {
    if (formData.property_length_ft && formData.property_width_ft) {
      return Math.round(formData.property_length_ft * formData.property_width_ft);
    }
    return null;
  };

  const handleBuildingSizeModeChange = (mode: 'sqft' | 'dimensions') => {
    setFormData((prev) => ({ ...prev, building_size_input_mode: mode }));
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

  const calculateBuildingSize = () => {
    if (formData.building_length_ft && formData.building_width_ft) {
      return Math.round(formData.building_length_ft * formData.building_width_ft);
    }
    return null;
  };

  const validatePrice = (
    listingType: string,
    callForPrice: boolean,
    price: number | null,
    askingPrice: number | null
  ): string | null => {
    if (callForPrice) {
      return null;
    }

    if (listingType === 'rental') {
      if (price === null || price === undefined || price <= 0) {
        return "Please enter a valid monthly rent greater than $0";
      }
    } else if (listingType === 'sale') {
      if (askingPrice === null || askingPrice === undefined || askingPrice <= 0) {
        return "Please enter a valid asking price greater than $0";
      }
    }

    return null;
  };

  const handlePriceChange = (value: string) => {
    const numValue = value ? Number(value) : null;
    const isSale = formData.listing_type === 'sale';

    setFormData((f) => ({
      ...f,
      ...(isSale ? { asking_price: numValue } : { price: numValue }),
    }));

    const error = validatePrice(
      formData.listing_type,
      formData.call_for_price,
      isSale ? formData.price : numValue,
      isSale ? numValue : formData.asking_price
    );
    setPriceError(error);
  };

  const handleCallForPriceChange = (checked: boolean) => {
    const isSale = formData.listing_type === 'sale';

    setFormData((f) => ({
      ...f,
      call_for_price: checked,
      ...(isSale
        ? { asking_price: checked ? null : f.asking_price }
        : { price: checked ? null : f.price }
      ),
    }));

    if (checked) {
      setPriceError(null);
    } else {
      const error = validatePrice(
        formData.listing_type,
        false,
        formData.price,
        formData.asking_price
      );
      setPriceError(error);
    }
  };

  const handlePermissionRequest = async () => {
    if (!user?.id) {
      alert('Please sign in to request permission');
      return;
    }

    if (!permissionRequestMessage.trim()) {
      alert('Please provide a reason for requesting sales permission');
      return;
    }

    try {
      setRequestingPermission(true);
      await salesService.createPermissionRequest(user.id, permissionRequestMessage);
      alert('Your request has been submitted. Admins will be notified via email.');
      setShowPermissionModal(false);
      setPermissionRequestMessage('');
    } catch (error) {
      console.error('Error requesting permission:', error);
      alert('Failed to submit request. Please try again.');
    } finally {
      setRequestingPermission(false);
    }
  };

  const handleMediaAdd = async (files: File[]) => {
    handleFirstInteraction();

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
    handleFirstInteraction();
    setMediaFiles((prev) => {
      const mediaToRemove = prev.find(m => m.id === id);
      if (mediaToRemove?.type === 'video' && mediaToRemove.url.startsWith('blob:')) {
        URL.revokeObjectURL(mediaToRemove.url);
      }

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
    handleFirstInteraction();
    setMediaFiles((prev) =>
      prev.map((m) => ({
        ...m,
        is_featured: m.id === id && m.type === 'image',
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

    if (!neighborhood || neighborhood === "") {
      alert("Please select or enter a neighborhood");
      setLoading(false);
      return;
    }

    if (neighborhoodSelectValue === "other" && neighborhood === "") {
      alert("Please enter a neighborhood");
      setLoading(false);
      return;
    }

    if (!formData.property_type || formData.property_type === "") {
      alert("Please select a property type");
      setLoading(false);
      return;
    }

    if (!formData.terms_agreed) {
      alert("Please agree to the Terms and Conditions and Privacy Policy before posting");
      setLoading(false);
      return;
    }

    const imageFiles = mediaFiles.filter(m => m.type === 'image');
    if (formData.listing_type === 'sale' && imageFiles.length < 2) {
      alert("Please upload at least 2 images for sale listings");
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

      const priceValidationError = validatePrice(
        formData.listing_type,
        formData.call_for_price,
        formData.price,
        formData.asking_price
      );
      if (priceValidationError) {
        setPriceError(priceValidationError);
        alert(priceValidationError);
        setLoading(false);
        return;
      }

      // Track submission attempt only after validation passes
      trackPostSubmit();

      // Format address for sales listings
      let finalLocation = formData.location;
      let fullAddress = null;

      if (formData.listing_type === 'sale' && formData.street_address) {
        // Build full address string
        const addressParts = [
          formData.street_address,
          formData.unit_number ? `Unit ${formData.unit_number}` : '',
          formData.city || 'Brooklyn',
          formData.state || 'NY',
          formData.zip_code || ''
        ].filter(Boolean);
        fullAddress = addressParts.join(', ');
        finalLocation = fullAddress;
      }

      // Calculate lot size if using dimensions mode
      const finalLotSize = formData.lot_size_input_mode === 'dimensions' && formData.property_length_ft && formData.property_width_ft
        ? Math.round(formData.property_length_ft * formData.property_width_ft)
        : formData.lot_size_sqft;

      // Calculate building size if using dimensions mode
      const finalBuildingSize = formData.building_size_input_mode === 'dimensions' && formData.building_length_ft && formData.building_width_ft
        ? Math.round(formData.building_length_ft * formData.building_width_ft)
        : formData.building_size_sqft;

      // Determine the user_id for the listing
      const listingUserId = (profile?.is_admin && adminAssignUser) ? adminAssignUser.id : user.id;

      // Create the listing first
      const payload = {
        ...formData,
        broker_fee: false,
        neighborhood,
        location: finalLocation,
        full_address: fullAddress,
        user_id: listingUserId,
        agency_id: ownedAgencyId || null,
        admin_custom_agency_name: (profile?.is_admin && !adminAssignUser && adminCustomAgencyName.trim())
          ? adminCustomAgencyName.trim()
          : null,
        admin_listing_type_display: (profile?.is_admin && !adminAssignUser && adminListingTypeDisplay)
          ? adminListingTypeDisplay
          : null,
        is_active: false,
        approved: false,
        // For rental listings: use price field
        // For sale listings: use asking_price field and set price to null
        price: formData.listing_type === 'sale'
          ? null
          : (formData.call_for_price ? null : formData.price),
        asking_price: formData.listing_type === 'sale'
          ? (formData.call_for_price ? null : formData.asking_price)
          : null,
        call_for_price: !!formData.call_for_price,
        ac_type: formData.ac_type || null,
        apartment_conditions: formData.apartment_conditions?.length > 0 ? formData.apartment_conditions : null,
        additional_rooms: formData.additional_rooms > 0 ? formData.additional_rooms : null,
        lot_size_sqft: finalLotSize,
        building_size_sqft: finalBuildingSize,
        property_condition: formData.property_condition || null,
        occupancy_status: formData.occupancy_status || null,
        delivery_condition: formData.delivery_condition || null,
        outdoor_space: formData.outdoor_space?.length > 0 ? formData.outdoor_space : null,
        interior_features: formData.interior_features?.length > 0 ? formData.interior_features : null,
        laundry_type: formData.laundry_type || null,
        basement_type: formData.basement_type || null,
        basement_notes: formData.basement_notes || null,
        building_type: formData.building_type || null,
        rent_roll_total: formData.rent_roll_total,
        rent_roll_data: formData.rent_roll_data?.length > 0 ? formData.rent_roll_data : null,
        utilities_included: formData.utilities_included?.length > 0 ? formData.utilities_included : null,
        tenant_notes: formData.tenant_notes || null,
        year_renovated: formData.year_renovated || null,
        heating_type: formData.heating_type || null,
        latitude: formData.latitude,
        longitude: formData.longitude,
        terms_agreed: undefined,
        building_size_input_mode: undefined,
        lot_size_input_mode: undefined,
        street_address: undefined,
        unit_number: undefined,
        city: undefined,
        state: undefined,
        zip_code: undefined,
      } as any;
      const listing = await listingsService.createListing(payload);

      // Track successful submission
      trackPostSuccess(listing.id);

      // Process media files (images and videos)
      const imageMedia = mediaFiles.filter(m => m.type === 'image');
      const videoMedia = mediaFiles.find(m => m.type === 'video');

      // Process images: upload temp images to listing
      if (imageMedia.length > 0) {
        const tempImages = imageMedia.map(m => ({
          filePath: m.filePath!,
          publicUrl: m.publicUrl || m.url,
          is_featured: m.is_featured,
          originalName: m.originalName || ''
        }));
        await listingsService.finalizeTempListingImages(
          listing.id,
          user.id,
          tempImages,
        );
      }

      // Process video if uploaded
      if (videoMedia && videoMedia.file) {
        try {
          setUploadingMedia(true);
          console.log("🎥 Starting video upload process...");

          const videoUrl = await listingsService.uploadListingVideo(
            videoMedia.file,
            listing.id
          );

          console.log("✅ Video uploaded successfully:", videoUrl);

          // If no images were uploaded, generate and upload video thumbnail
          if (imageMedia.length === 0) {
            console.log("📸 No images detected, generating video thumbnail...");
            try {
              const thumbnailBlob = await generateVideoThumbnail(videoMedia.file);
              console.log("✅ Thumbnail blob generated, size:", thumbnailBlob.size);

              const thumbnailFile = new File(
                [thumbnailBlob],
                `thumbnail_${listing.id}.jpg`,
                { type: 'image/jpeg' }
              );

              // Upload thumbnail as listing image
              console.log("📤 Uploading thumbnail to storage...");
              const thumbnailUrl = await listingsService.uploadListingImage(
                thumbnailFile,
                listing.id
              );
              console.log("✅ Thumbnail uploaded to storage:", thumbnailUrl);

              // Add thumbnail to listing_images table
              console.log("💾 Adding thumbnail to listing_images table...");
              await listingsService.addListingImage(
                listing.id,
                thumbnailUrl,
                true, // Set as featured
                0 // Sort order
              );
              console.log("✅ Thumbnail added to listing_images table");

              // Update listing with both video_url and video_thumbnail_url
              console.log("💾 Updating listing with video URLs...");
              await listingsService.updateListing(listing.id, {
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
              await listingsService.updateListing(listing.id, {
                video_url: videoUrl,
              });

              alert("Video uploaded successfully, but thumbnail generation failed. A stock photo will be used on listing cards.");
            }
          } else {
            // Images exist, just update video URL
            await listingsService.updateListing(listing.id, {
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

      // Send email notifications
      try {
        const siteUrl = window.location.origin;

        // If admin assigned listing to another user, send notification to that user
        if (profile?.is_admin && adminAssignUser && adminAssignUser.email) {
          const assignedHtml = renderBrandEmail({
            title: "New Listing Assigned to You",
            intro: `A listing has been created and assigned to your account by an administrator.`,
            bodyHtml: `<p><strong>Listing:</strong> ${formData.title}</p><p>You can view and manage this listing from your dashboard.</p>`,
            ctaLabel: "View Listing",
            ctaHref: `${siteUrl}/listing/${listing.id}`,
          });

          await emailService.sendEmail({
            to: adminAssignUser.email,
            subject: `Listing Assigned: ${formData.title} - HaDirot`,
            html: assignedHtml,
          });

          console.log("✅ Listing assignment email sent to user:", adminAssignUser.email);
        }

        // Send confirmation email to the current user (admin or regular user)
        const userName = profile?.full_name || "A user";
        const html = renderBrandEmail({
          title: "New Listing Posted",
          intro: adminAssignUser
            ? `You have created a listing and assigned it to ${adminAssignUser.full_name}.`
            : `${userName} has posted a new listing.`,
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

      // Capture error in Sentry with full context
      Sentry.captureException(error, {
        tags: {
          error_source: 'listing_creation',
          error_type: error instanceof Error && error.message.includes('constraint') ? 'database_constraint' : 'listing_creation_failed',
          has_constraint_violation: error instanceof Error && error.message.includes('check constraint') ? 'true' : 'false',
        },
        contexts: {
          form_data: {
            bedrooms: formData.bedrooms,
            additional_rooms: formData.additional_rooms,
            bathrooms: formData.bathrooms,
            property_type: formData.property_type,
            neighborhood: formData.neighborhood || neighborhoodSelectValue,
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
            has_agency: !!ownedAgencyId,
          },
        },
        extra: {
          error_details: error instanceof Error ? {
            message: error.message,
            name: error.name,
          } : { raw_error: String(error) },
        },
      });

      // Track the error with sanitized payload data
      trackPostError(error, {
        bedrooms: formData.bedrooms,
        bathrooms: formData.bathrooms,
        property_type: formData.property_type,
        neighborhood: formData.neighborhood || neighborhoodSelectValue,
        parking: formData.parking,
        lease_length: formData.lease_length,
        is_featured: formData.is_featured,
        call_for_price: formData.call_for_price,
        price: formData.price,
      });

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
        } else if (error.message.includes("check constraint") || error.message.includes("constraint")) {
          errorMessage = "There was an issue with the listing data. Please check all fields and try again.";
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
        <h1 className="text-3xl font-bold text-brand-700">Post a Listing</h1>
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
        {/* Listing Type Selector - Always Visible */}
        <div className="bg-white rounded-lg shadow-sm border-2 border-accent-500 p-6">
          <h2 className="text-xl font-semibold text-brand-700 mb-2">
            Choose Listing Type *
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Select the type of listing you want to create to continue
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, listing_type: 'rental' })}
              className={`p-6 border-2 rounded-lg transition-all ${
                formData.listing_type === 'rental'
                  ? 'border-accent-500 bg-accent-50 shadow-md'
                  : 'border-gray-300 hover:border-accent-400 hover:bg-gray-50'
              }`}
            >
              <div className="text-lg font-bold text-brand-700">Rental Listing</div>
              <div className="text-sm text-gray-600 mt-1">Post a property for rent</div>
            </button>

            {salesFeatureEnabled ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (canPostSales) {
                      setFormData({ ...formData, listing_type: 'sale' });
                    } else {
                      setShowPermissionModal(true);
                    }
                  }}
                  className={`w-full p-6 border-2 rounded-lg transition-all ${
                    formData.listing_type === 'sale'
                      ? 'border-accent-500 bg-accent-50 shadow-md'
                      : 'border-gray-300 hover:border-accent-400 hover:bg-gray-50'
                  } ${!canPostSales ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="text-lg font-bold text-brand-700">Sale Listing</div>
                  <div className="text-sm text-gray-600 mt-1">Post a property for sale</div>
                </button>
                {!canPostSales && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-90 rounded-lg pointer-events-none">
                    <div className="text-center p-4">
                      <p className="text-sm font-medium text-gray-700">
                        You don't have permission to post sale listings yet.
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowPermissionModal(true);
                        }}
                        className="text-sm text-accent-600 underline font-medium mt-1 pointer-events-auto"
                      >
                        Request permission
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                disabled
                className="p-6 border-2 rounded-lg transition-all border-gray-300 opacity-50 cursor-not-allowed"
              >
                <div className="text-lg font-bold text-gray-500">Sale Listing</div>
                <div className="text-sm text-gray-500 mt-1">Coming soon</div>
              </button>
            )}
          </div>
        </div>

        {/* Admin Listing Assignment - Only visible to admins */}
        {profile?.is_admin && (
          <div className="bg-amber-50 rounded-lg shadow-sm border-2 border-amber-400 p-6">
            <h2 className="text-xl font-semibold text-amber-800 mb-2">
              Admin: Listing Assignment
            </h2>
            <p className="text-sm text-amber-700 mb-4">
              As an admin, you can assign this listing to another user or customize the display settings.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign to User (optional)
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
        <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 relative transition-all ${
          !formData.listing_type ? 'opacity-40 pointer-events-none' : ''
        }`}>
          <h2 className="text-xl font-semibold text-brand-700 mb-4">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
                placeholder="Describe your property, amenities, and neighborhood..."
              />
            </div>

            {formData.listing_type === 'sale' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Street Address *
                  </label>
                  <input
                    type="text"
                    name="street_address"
                    value={formData.street_address}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
                    placeholder="123 Main Street"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unit/Apt #
                    </label>
                    <input
                      type="text"
                      name="unit_number"
                      value={formData.unit_number}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
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
                      value={formData.zip_code}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
                      placeholder="11201"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      City *
                    </label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
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
                      value={formData.state}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
                      placeholder="NY"
                      maxLength={2}
                    />
                  </div>
                </div>

                <div className="lg:col-span-2 mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Set Location on Map (optional)
                  </label>
                  <p className="text-sm text-gray-500 mb-3">
                    Help buyers find your property by setting its location on the map.
                  </p>
                  <LocationPicker
                    crossStreets={`${formData.street_address || ''}, ${formData.city || ''}, ${formData.state || ''}`}
                    neighborhood={formData.neighborhood}
                    latitude={formData.latitude}
                    longitude={formData.longitude}
                    onLocationChange={handleLocationCoordinatesChange}
                    onNeighborhoodChange={handleNeighborhoodFromMap}
                  />
                </div>
              </>
            ) : (
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700 mb-4"
                  placeholder="Avenue J & East 15th Street"
                />
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Set Location on Map (optional)
                  </label>
                  <p className="text-sm text-gray-500 mb-3">
                    Help tenants find your listing by setting its location on the map.
                  </p>
                  <LocationPicker
                    crossStreets={formData.location}
                    neighborhood={formData.neighborhood}
                    latitude={formData.latitude}
                    longitude={formData.longitude}
                    onLocationChange={handleLocationCoordinatesChange}
                    onNeighborhoodChange={handleNeighborhoodFromMap}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Neighborhood *
              </label>
              <select
                name="neighborhood"
                value={neighborhoodSelectValue}
                onChange={handleNeighborhoodSelect}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
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
                  className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
              >
                <option value="">Select Property Type</option>
                {formData.listing_type === 'sale' ? (
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

            {formData.listing_type === 'sale' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Building Type *
                </label>
                <select
                  name="building_type"
                  value={formData.building_type || ''}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
                >
                  <option value="">Select Building Type</option>
                  <option value="detached">Detached</option>
                  <option value="semi_attached">Semi-Attached</option>
                  <option value="fully_attached">Fully Attached</option>
                  <option value="apartment">Apartment</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Property Details */}
        <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 relative transition-all ${
          !formData.listing_type ? 'opacity-40 pointer-events-none' : ''
        }`}>
          <h2 className="text-xl font-semibold text-brand-700 mb-4">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
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

            {formData.listing_type === 'rental' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Floor
                </label>
                <input
                  type="number"
                  name="floor"
                  value={formData.floor || ""}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
                  placeholder="2"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {formData.listing_type === 'sale' ? 'Asking Price ($) *' : 'Monthly Rent ($) *'}
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={formData.listing_type === 'sale' ? (formData.asking_price ?? '') : (formData.price ?? '')}
                onChange={(e) => handlePriceChange(e.target.value)}
                disabled={formData.call_for_price}
                required={!formData.call_for_price}
                className={`w-full px-3 py-2 border rounded-md focus:ring-brand-700 focus:border-brand-700 ${
                  priceError && !formData.call_for_price ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder={formData.listing_type === 'sale' ? '450000' : '2500'}
              />
              {priceError && !formData.call_for_price && (
                <p className="text-red-600 text-sm mt-1">{priceError}</p>
              )}
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={formData.call_for_price}
                  onChange={(e) => handleCallForPriceChange(e.target.checked)}
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
                placeholder="800"
              />
            </div>

            {formData.listing_type === 'rental' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lease Length
                </label>
                <select
                  name="lease_length"
                  value={formData.lease_length || ""}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
                >
                  <option value="">Select lease length (optional)</option>
                  <option value="short_term">Short Term</option>
                  <option value="1_year">1 Year</option>
                  <option value="18_months">18 Months</option>
                  <option value="2_years">2 Years</option>
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
              >
                {formData.listing_type === 'sale' ? (
                  <>
                    <option value="no">No Parking</option>
                    <option value="yes">Private Driveway</option>
                    <option value="included">Shared Driveway</option>
                    <option value="carport">Carport</option>
                    <option value="optional">Easement (parking in back/garage)</option>
                  </>
                ) : (
                  <>
                    <option value="no">No Parking</option>
                    <option value="yes">Parking Available</option>
                    <option value="included">Parking Included</option>
                    <option value="optional">Optional Parking</option>
                  </>
                )}
              </select>
            </div>

            {formData.listing_type === 'rental' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Heat
                </label>
                <select
                  name="heat"
                  value={formData.heat}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
                >
                  <option value="tenant_pays">Tenant Pays</option>
                  <option value="included">Heat Included</option>
                </select>
              </div>
            )}
          </div>

          {formData.listing_type === 'rental' && (
            <>
              {/* Apartment Conditions - Rental Only */}
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
                      className="h-4 w-4 text-brand-700 focus:ring-[#273140] border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm font-medium text-gray-700">Modern</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.apartment_conditions.includes('renovated')}
                      onChange={() => handleApartmentConditionToggle('renovated')}
                      className="h-4 w-4 text-brand-700 focus:ring-[#273140] border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm font-medium text-gray-700">Renovated</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.apartment_conditions.includes('large_rooms')}
                      onChange={() => handleApartmentConditionToggle('large_rooms')}
                      className="h-4 w-4 text-brand-700 focus:ring-[#273140] border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm font-medium text-gray-700">Large Rooms</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.apartment_conditions.includes('high_ceilings')}
                      onChange={() => handleApartmentConditionToggle('high_ceilings')}
                      className="h-4 w-4 text-brand-700 focus:ring-[#273140] border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm font-medium text-gray-700">High Ceilings</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.apartment_conditions.includes('large_closets')}
                      onChange={() => handleApartmentConditionToggle('large_closets')}
                      className="h-4 w-4 text-brand-700 focus:ring-[#273140] border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm font-medium text-gray-700">Large Closets</span>
                  </label>
                </div>
              </div>
            </>
          )}

          {formData.listing_type === 'rental' && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="washer_dryer_hookup"
                  checked={formData.washer_dryer_hookup}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-brand-700 focus:ring-[#273140] border-gray-300 rounded"
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
                  className="h-4 w-4 text-brand-700 focus:ring-[#273140] border-gray-300 rounded"
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
                    className="h-4 w-4 text-brand-700 focus:ring-[#273140] border-gray-300 rounded"
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
                  className="h-4 w-4 text-brand-700 focus:ring-[#273140] border-gray-300 rounded"
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
          )}
        </div>

        {/* Sales-Specific Fields */}
        {formData.listing_type === 'sale' && canPostSales && (
          <div className="space-y-6">
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
          </div>
        )}

        {/* Media Upload (Images & Videos) */}
        <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 relative transition-all ${
          !formData.listing_type ? 'opacity-40 pointer-events-none' : ''
        }`}>
          <h2 className="text-xl font-semibold text-brand-700 mb-4">
            Media (Images & Video)
          </h2>

          <MediaUploader
            mediaFiles={mediaFiles}
            onMediaAdd={handleMediaAdd}
            onMediaRemove={handleMediaRemove}
            onSetFeatured={handleSetFeatured}
            maxFiles={11}
            minFiles={formData.listing_type === 'sale' ? 2 : 0}
            disabled={!user}
            uploading={uploadingMedia}
            showAuthWarning={!user}
          />

          {/* Auto-save indicator */}
          {savingDraft && (
            <div className="mt-4 flex items-center text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#273140] mr-2"></div>
              Saving draft...
            </div>
          )}
        </div>

        {/* Contact Information */}
        <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 relative transition-all ${
          !formData.listing_type ? 'opacity-40 pointer-events-none' : ''
        }`}>
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
        <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 relative transition-all ${
          !formData.listing_type ? 'opacity-40 pointer-events-none' : ''
        }`}>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={formData.terms_agreed}
              onChange={(e) => setFormData(prev => ({ ...prev, terms_agreed: e.target.checked }))}
              className="mt-1 h-4 w-4 text-accent-600 focus:ring-accent-500 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700">
              By posting this listing, I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-brand-700 font-semibold hover:underline">Terms and Conditions</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-700 font-semibold hover:underline">Privacy Policy</a>.
            </span>
          </label>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || !formData.listing_type || !formData.terms_agreed}
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

      {/* Permission Request Modal */}
      <Modal
        isOpen={showPermissionModal}
        onClose={() => {
          setShowPermissionModal(false);
          setPermissionRequestMessage('');
        }}
        title="Request Sales Listing Permission"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Please provide a reason for requesting permission to post sale listings.
            Admins will be notified via email and will review your request.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Why do you need sales listing access?
            </label>
            <textarea
              value={permissionRequestMessage}
              onChange={(e) => setPermissionRequestMessage(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
              placeholder="e.g., I am a licensed real estate agent looking to list properties for sale..."
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setShowPermissionModal(false);
                setPermissionRequestMessage('');
              }}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePermissionRequest}
              disabled={requestingPermission || !permissionRequestMessage.trim()}
              className="px-4 py-2 bg-brand-700 text-white rounded-md hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {requestingPermission ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
