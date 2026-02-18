import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import * as Sentry from "@sentry/react";
import { useAuth } from "@/hooks/useAuth";
import { listingsService, getExpirationDate } from "../services/listings";
import { emailService, renderBrandEmail } from "../services/email";
import { draftListingsService, DraftData, TempVideoData } from "../services/draftListings";
import { agenciesService } from "../services/agencies";
import { salesService } from "../services/sales";
import { reverseGeocode } from "../services/reverseGeocode";
import { Modal } from "../components/shared/Modal";
import { AuthForm } from "../components/auth/AuthForm";
import { compressImage } from "../utils/imageUtils";
import { generateVideoThumbnail } from "../utils/videoUtils";
import { MediaUploader, MediaFile } from "../components/shared/MediaUploader";
import { SalesListingFields } from "../components/listing/SalesListingFields";
import { LocationPicker } from "../components/listing/LocationPicker";
import { MapboxStreetAutocomplete, MapboxFeature } from "../components/listing/MapboxStreetAutocomplete";
import type { Profile, RentRollUnit } from "../config/supabase";
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
import type { ListingFormData } from "./postListing/types";
import { INITIAL_FORM_DATA } from "./postListing/types";
import { mapAIParsedDataToFormFields, validatePrice } from "./postListing/aiParseMapper";
import { AIParserSection } from "./postListing/AIParserSection";
import { AdminAssignmentSection } from "./postListing/AdminAssignmentSection";
import { PermissionRequestModal } from "./postListing/PermissionRequestModal";
import { RentalPropertyDetails } from "./postListing/RentalPropertyDetails";
import { ContactAndSubmitSection } from "./postListing/ContactAndSubmitSection";

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
  const [pendingSubmitAfterAuth, setPendingSubmitAfterAuth] = useState(false);
  const [neighborhoodSelectValue, setNeighborhoodSelectValue] = useState<string>("");
  const [showCustomNeighborhood, setShowCustomNeighborhood] = useState(false);
  const [customNeighborhoodInput, setCustomNeighborhoodInput] = useState("");
  const [ownedAgencyId, setOwnedAgencyId] = useState<string | null>(null);
  const [salesFeatureEnabled, setSalesFeatureEnabled] = useState(false);
  const [salesUniversalAccess, setSalesUniversalAccess] = useState(false);
  const [canPostSales, setCanPostSales] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionRequestMessage, setPermissionRequestMessage] = useState('');
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geocodeSuccess, setGeocodeSuccess] = useState<string | null>(null);
  const [adminAssignUser, setAdminAssignUser] = useState<Profile | null>(null);
  const [adminCustomAgencyName, setAdminCustomAgencyName] = useState('');
  const [adminListingTypeDisplay, setAdminListingTypeDisplay] = useState<'agent' | 'owner' | ''>('');
  const [crossStreetAFeature, setCrossStreetAFeature] = useState<MapboxFeature | null>(null);
  const [crossStreetBFeature, setCrossStreetBFeature] = useState<MapboxFeature | null>(null);
  const [isLocationConfirmed, setIsLocationConfirmed] = useState(false);
  const [showAIParser, setShowAIParser] = useState(false);
  const [aiParserText, setAiParserText] = useState('');
  const [aiParserLoading, setAiParserLoading] = useState(false);
  const [aiParserError, setAiParserError] = useState<string | null>(null);
  const [aiParserSuccess, setAiParserSuccess] = useState(false);
  const [isAIParsed, setIsAIParsed] = useState(false);
  const [originalParsedText, setOriginalParsedText] = useState('');
  const [showOriginalText, setShowOriginalText] = useState(false);
  const [formData, setFormData] = useState<ListingFormData>({
    ...INITIAL_FORM_DATA,
    contact_name: profile?.full_name || "",
    contact_phone: profile?.phone || "",
  });

  const [hasDraft, setHasDraft] = useState<boolean | null>(null);
  const hasInteractedRef = useRef(false);
  const startTrackedRef = useRef(false);
  const hasManuallySelectedTypeRef = useRef(false);
  const permissionsLoadedRef = useRef(false);

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
    salesService.getSalesSettings().then(s => setSalesUniversalAccess(s?.sales_universal_access || false));
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

  // Auto-select listing type based on priority order
  useEffect(() => {
    // Wait for both permissions and draft to be loaded
    if (hasDraft === null) {
      return; // Still loading draft
    }

    // Mark permissions as loaded once we have the values
    if (!permissionsLoadedRef.current) {
      permissionsLoadedRef.current = true;
    }

    // Priority 1: Draft has listing_type - already handled by loadDraftData
    // Priority 2: User manually selected a type - don't override
    if (hasManuallySelectedTypeRef.current) {
      return;
    }

    // Priority 3: User lacks canPostSales AND universal access is off - auto-select rental
    // Priority 4: Otherwise leave empty to force explicit choice
    if (!canPostSales && !salesUniversalAccess && formData.listing_type === '') {
      setFormData(prev => ({ ...prev, listing_type: 'rental' }));
    }
  }, [hasDraft, canPostSales, salesUniversalAccess, formData.listing_type]);

  // Sync heat field with utilities_included array for rental listings
  useEffect(() => {
    if (formData.listing_type === 'rental') {
      const hasHeatIncluded = formData.utilities_included?.includes('heat');
      const currentHeatValue = formData.heat;

      // Sync: if utilities has heat, set heat field to 'included'
      if (hasHeatIncluded && currentHeatValue !== 'included') {
        setFormData(prev => ({ ...prev, heat: 'included' }));
      } else if (!hasHeatIncluded && currentHeatValue === 'included') {
        // If heat is 'included' but utilities doesn't have heat, set to 'tenant_pays'
        setFormData(prev => ({ ...prev, heat: 'tenant_pays' }));
      }
    }
  }, [formData.listing_type, formData.utilities_included, formData.heat]);

  // Debug logging for utilities_included changes
  useEffect(() => {
    if (formData.utilities_included && formData.utilities_included.length > 0) {
      console.log('🔧 Utilities included updated:', formData.utilities_included);
      console.log('🔧 Heat field value:', formData.heat);
    }
  }, [formData.utilities_included, formData.heat]);

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
          listing_type: (draftData as any).listing_type || "",
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

        const restoredListingType = (draftData as any).listing_type || "";
        const restoredCallForPrice = draftData.call_for_price ?? false;
        const restoredPrice = draftData.call_for_price ? null : draftData.price ?? null;
        const restoredAskingPrice = (draftData as any).asking_price || null;

        // If draft has a listing_type, mark it as manually selected (Priority 1)
        if ((draftData as any).listing_type) {
          hasManuallySelectedTypeRef.current = true;
        }

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
      // Special handling for heat field - sync with utilities_included
      if (name === "heat") {
        setFormData((prev) => {
          const utilities = prev.utilities_included || [];
          const newUtilities = value === "included"
            ? utilities.includes('heat') ? utilities : [...utilities, 'heat']
            : utilities.filter(u => u !== 'heat');
          return { ...prev, [name]: value, utilities_included: newUtilities };
        });
      } else {
        setFormData((prev) => ({ ...prev, [name]: value }));
      }
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

  const handleZipCodeFromMap = (zipCode: string) => {
    setFormData((prev) => ({ ...prev, zip_code: zipCode }));
  };

  const handleCityFromMap = (city: string) => {
    setFormData((prev) => ({ ...prev, city: city }));
  };

  const handleGeocodeStatusChange = (error: string | null, success: string | null) => {
    setGeocodeError(error);
    setGeocodeSuccess(success);
  };

  const handleConfirmationStatusChange = (confirmed: boolean) => {
    setIsLocationConfirmed(confirmed);
  };

  const calculateBuildingSize = () => {
    if (formData.building_length_ft && formData.building_width_ft) {
      return Math.round(formData.building_length_ft * formData.building_width_ft);
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

  const handleAIParse = async () => {
    if (!aiParserText.trim()) {
      setAiParserError('Please paste listing text first');
      return;
    }

    try {
      setAiParserLoading(true);
      setAiParserError(null);
      setAiParserSuccess(false);

      // Create timeout controller
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch('https://n8n.srv1283324.hstgr.cloud/webhook/parse-listing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: aiParserText }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const parsedData = await response.json();

      console.log('========== N8N WEBHOOK RESPONSE ==========');
      console.log('Full Response:', JSON.stringify(parsedData, null, 2));
      console.log('Response Type:', typeof parsedData);
      console.log('Response Keys:', Object.keys(parsedData));
      console.log('==========================================');

      const { updatedFormData, crossStreetA, crossStreetB } = mapAIParsedDataToFormFields(
        parsedData,
        formData.listing_type
      );

      if (crossStreetA) setCrossStreetAFeature(crossStreetA);
      if (crossStreetB) setCrossStreetBFeature(crossStreetB);

      console.log('Current formData before update:', formData);
      setFormData(prev => {
        const newFormData = { ...prev, ...updatedFormData };
        console.log('New formData after merge:', newFormData);
        return newFormData;
      });

      // Store original text for reference
      setOriginalParsedText(aiParserText);
      setIsAIParsed(true);
      setAiParserSuccess(true);

      setTimeout(() => {
        setShowAIParser(false);
      }, 2000);

    } catch (error) {
      console.error('AI Parse Error:', error);

      // Better error messages for different error types
      if (error instanceof Error && error.name === 'AbortError') {
        setAiParserError('Request timed out after 30 seconds. Please try again or check your connection.');
      } else if (error instanceof Error) {
        setAiParserError(`Failed to parse listing: ${error.message}`);
      } else {
        setAiParserError('Failed to connect to AI parser. Please try again.');
      }
    } finally {
      setAiParserLoading(false);
    }
  };

  const handleClearAIData = () => {
    if (confirm('Are you sure you want to clear all AI-parsed data and start over?')) {
      setFormData({
        ...INITIAL_FORM_DATA,
        contact_name: profile?.full_name || "",
        contact_phone: profile?.phone || "",
      });
      setAiParserText('');
      setOriginalParsedText('');
      setIsAIParsed(false);
      setAiParserSuccess(false);
      setAiParserError(null);
    }
  };

  const handleMediaAdd = async (files: File[]) => {
    handleFirstInteraction();

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

          if (!user) {
            const previewUrl = URL.createObjectURL(fileToUpload);
            const is_featured = !hasFeatured;
            if (!hasFeatured) hasFeatured = true;

            newMedia.push({
              id: `img-${Date.now()}-${Math.random()}`,
              type: 'image',
              file: fileToUpload,
              url: previewUrl,
              is_featured,
              originalName: file.name
            });
          } else {
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
      if (mediaToRemove?.url.startsWith('blob:')) {
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

  const uploadPendingMedia = async (): Promise<boolean> => {
    if (!user) return false;
    const pending = mediaFiles.filter(m => m.type === 'image' && !m.filePath && m.file);
    if (pending.length === 0) return true;

    setUploadingMedia(true);
    try {
      const updates: { id: string; filePath: string; publicUrl: string }[] = [];
      for (const entry of pending) {
        try {
          const { filePath, publicUrl } = await listingsService.uploadTempListingImage(entry.file!, user.id);
          updates.push({ id: entry.id, filePath, publicUrl });
        } catch (err) {
          console.error(`Error uploading ${entry.originalName}:`, err);
          alert(`Failed to upload ${entry.originalName || 'image'}. Please try again.`);
          setUploadingMedia(false);
          return false;
        }
      }
      setMediaFiles(prev =>
        prev.map(m => {
          const update = updates.find(u => u.id === m.id);
          if (!update) return m;
          return { ...m, filePath: update.filePath, publicUrl: update.publicUrl, url: update.publicUrl };
        })
      );
      return true;
    } finally {
      setUploadingMedia(false);
    }
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
      // For rental listings, get neighborhood from form
      // For sale listings, it will be derived from coordinates at submission time
      const neighborhood =
        formData.listing_type === 'rental'
          ? (neighborhoodSelectValue === "other"
            ? customNeighborhoodInput.trim()
            : neighborhoodSelectValue)
          : '';

      // Validate neighborhood only for rental listings
      if (formData.listing_type === 'rental') {
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
      }

    if (!formData.property_type || formData.property_type === "") {
      alert("Please select a property type");
      setLoading(false);
      return;
    }

    if (!formData.latitude || !formData.longitude) {
      alert("Please set a location on the map before posting. Use 'Find on Map' or 'Set Pin Location' to geocode your listing.");
      setLoading(false);
      return;
    }

    if (!isLocationConfirmed) {
      alert("Please confirm the map location before submitting. Open the map modal and click 'Confirm Location'.");
      setLoading(false);
      return;
    }

    if (!formData.terms_agreed) {
      alert("Please agree to receive SMS messages before posting");
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

      // For sale listings, derive neighborhood from coordinates
      let finalNeighborhood = neighborhood;
      if (formData.listing_type === 'sale' && formData.latitude && formData.longitude) {
        try {
          const geoResult = await reverseGeocode(formData.latitude, formData.longitude);
          if (geoResult.neighborhood) {
            finalNeighborhood = geoResult.neighborhood;
            console.log('✅ Auto-derived neighborhood for sale listing:', finalNeighborhood);
          } else {
            console.log('⚠️ Could not derive neighborhood from coordinates');
            finalNeighborhood = null;
          }
        } catch (error) {
          console.error('Error reverse geocoding for neighborhood:', error);
          finalNeighborhood = null;
        }
      }

      // Calculate expiration date based on listing type
      const listingType = formData.listing_type || 'rental';
      const expiresAt = getExpirationDate(listingType, listingType === 'sale' ? 'available' : undefined);

      // Create the listing first
      const payload = {
        ...formData,
        broker_fee: false,
        neighborhood: finalNeighborhood,
        location: finalLocation,
        cross_street_a: crossStreetAFeature?.text || null,
        cross_street_b: crossStreetBFeature?.text || null,
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
        is_featured: false,
        expires_at: expiresAt.toISOString(),
        sale_status: listingType === 'sale' ? 'available' : null,
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

      navigate(`/dashboard?new_listing=true&listing_id=${listing.id}`);

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
            is_featured: false,
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
        is_featured: false,
        call_for_price: formData.call_for_price,
        price: formData.price,
      });

      // Show specific error messages based on the error
      let errorMessage = "Failed to create listing. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes("platform only allows")) {
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
      setPendingSubmitAfterAuth(true);
      setShowAuthModal(true);
      return;
    }

    // If user is already logged in, proceed with submission
    await submitListingContent();
  };

  const handleAuthSuccess = async () => {
    setShowAuthModal(false);
    if (pendingSubmitAfterAuth) {
      setPendingSubmitAfterAuth(false);
      const uploaded = await uploadPendingMedia();
      if (uploaded) {
        await submitListingContent();
      }
    }
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
              onClick={() => {
                hasManuallySelectedTypeRef.current = true;
                setFormData({ ...formData, listing_type: 'rental' });
              }}
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
                    const canAccess = canPostSales || salesUniversalAccess;
                    if (canAccess) {
                      hasManuallySelectedTypeRef.current = true;
                      setFormData({ ...formData, listing_type: 'sale' });
                    } else {
                      setShowPermissionModal(true);
                    }
                  }}
                  className={`w-full p-6 border-2 rounded-lg transition-all ${
                    formData.listing_type === 'sale'
                      ? 'border-accent-500 bg-accent-50 shadow-md'
                      : 'border-gray-300 hover:border-accent-400 hover:bg-gray-50'
                  } ${!(canPostSales || salesUniversalAccess) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="text-lg font-bold text-brand-700">Sale Listing</div>
                  <div className="text-sm text-gray-600 mt-1">Post a property for sale</div>
                </button>
                {!(canPostSales || salesUniversalAccess) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-90 rounded-lg pointer-events-none">
                    <div className="text-center p-4">
                      <p className="text-sm font-medium text-gray-700">
                        You don't have permission to post sale listings yet.
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!user) {
                            setShowAuthModal(true);
                          } else {
                            setShowPermissionModal(true);
                          }
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

        {/* AI Parser Section - Only visible to admins */}
        {profile?.is_admin && (
          <AIParserSection
            showAIParser={showAIParser}
            setShowAIParser={setShowAIParser}
            aiParserText={aiParserText}
            setAiParserText={setAiParserText}
            aiParserLoading={aiParserLoading}
            aiParserError={aiParserError}
            setAiParserError={setAiParserError}
            aiParserSuccess={aiParserSuccess}
            setAiParserSuccess={setAiParserSuccess}
            isAIParsed={isAIParsed}
            originalParsedText={originalParsedText}
            showOriginalText={showOriginalText}
            setShowOriginalText={setShowOriginalText}
            onParse={handleAIParse}
            onClear={handleClearAIData}
          />
        )}

        {/* Admin Listing Assignment - Only visible to admins */}
        {profile?.is_admin && (
          <AdminAssignmentSection
            adminAssignUser={adminAssignUser}
            setAdminAssignUser={setAdminAssignUser}
            adminCustomAgencyName={adminCustomAgencyName}
            setAdminCustomAgencyName={setAdminCustomAgencyName}
            adminListingTypeDisplay={adminListingTypeDisplay}
            setAdminListingTypeDisplay={setAdminListingTypeDisplay}
          />
        )}

        {formData.listing_type && (<>

        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 relative">
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

                <div className="lg:col-span-2">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <div className="space-y-4">
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
                          <option value="single_family">Single-Family</option>
                          <option value="two_family">Two-Family</option>
                          <option value="three_family">Three-Family</option>
                          <option value="four_family">Multi-Family</option>
                          <option value="condo">Condo</option>
                          <option value="co_op">Co-op</option>
                        </select>
                      </div>

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

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Beds *
                          </label>
                          <select
                            name="bedrooms"
                            value={formData.bedrooms}
                            onChange={(e) => handleMainBedroomChange(e.target.value)}
                            className="w-full px-2 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700 text-sm"
                          >
                            <option value={0}>0</option>
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                            <option value={3}>3</option>
                            <option value={4}>4</option>
                            <option value={5}>5</option>
                            <option value={6}>6</option>
                            <option value={7}>7</option>
                            <option value={8}>8+</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Baths *
                          </label>
                          <select
                            name="bathrooms"
                            value={formData.bathrooms}
                            onChange={handleInputChange}
                            className="w-full px-2 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700 text-sm"
                          >
                            <option value={1}>1</option>
                            <option value={1.5}>1.5</option>
                            <option value={2}>2</option>
                            <option value={2.5}>2.5</option>
                            <option value={3}>3</option>
                            <option value={3.5}>3.5</option>
                            <option value={4}>4+</option>
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
                            className="w-full px-2 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700 text-sm"
                          >
                            <option value="no">None</option>
                            <option value="yes">Private</option>
                            <option value="included">Shared</option>
                            <option value="carport">Carport</option>
                            <option value="optional">Easement</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Asking Price ($) *
                        </label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={formData.asking_price ?? ''}
                          onChange={(e) => handlePriceChange(e.target.value)}
                          disabled={formData.call_for_price}
                          required={!formData.call_for_price}
                          className={`w-full px-3 py-2 border rounded-md focus:ring-brand-700 focus:border-brand-700 ${
                            priceError && !formData.call_for_price ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="450000"
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
                          <span className="text-sm text-gray-700">Call for Price</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Location on Map *
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
                        onZipCodeChange={handleZipCodeFromMap}
                        onCityChange={handleCityFromMap}
                        onGeocodeStatusChange={handleGeocodeStatusChange}
                        onConfirmationStatusChange={handleConfirmationStatusChange}
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="lg:col-span-2">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cross Streets *
                      </label>
                      <p className="text-xs text-gray-500 mb-2">
                        Please enter two exact street names
                      </p>
                      <div className="space-y-3">
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
                      {geocodeError && (
                        <p className="text-sm text-red-600 mt-1">{geocodeError}</p>
                      )}
                      {geocodeSuccess && !geocodeError && (
                        <div className="flex items-center gap-2 text-sm text-green-600 mt-1">
                          <CheckCircle className="w-4 h-4 flex-shrink-0" />
                          <span>{geocodeSuccess}</span>
                        </div>
                      )}
                    </div>

                    {/* Neighborhood field - only shown for rental listings */}
                    {formData.listing_type === 'rental' && (
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
                      >
                        <option value="">Select Property Type</option>
                        {formData.listing_type === 'sale' ? (
                          <>
                            <option value="single_family">Single-Family</option>
                            <option value="two_family">Two-Family</option>
                            <option value="three_family">Three-Family</option>
                            <option value="four_family">Multi-Family</option>
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Location on Map *
                    </label>
                    <p className="text-sm text-gray-500 mb-3">
                      Use "Find on Map" or "Set Pin Location" to geocode your property
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
                      onZipCodeChange={handleZipCodeFromMap}
                      onCityChange={handleCityFromMap}
                      onGeocodeStatusChange={handleGeocodeStatusChange}
                      onConfirmationStatusChange={handleConfirmationStatusChange}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Property Details - Rental Only */}
        {formData.listing_type === 'rental' && (
          <RentalPropertyDetails
            formData={formData}
            handleInputChange={handleInputChange}
            handleMainBedroomChange={handleMainBedroomChange}
            handleAdditionalRoomsChange={handleAdditionalRoomsChange}
            handleApartmentConditionToggle={handleApartmentConditionToggle}
            handleCallForPriceChange={handleCallForPriceChange}
            handlePriceChange={handlePriceChange}
            handleUtilityToggle={handleUtilityToggle}
            priceError={priceError}
          />
        )}

        {/* Sales-Specific Fields */}
        {formData.listing_type === 'sale' && (canPostSales || salesUniversalAccess) && (
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 relative">
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
            uploading={uploadingMedia}
          />

          {/* Auto-save indicator */}
          {savingDraft && (
            <div className="mt-4 flex items-center text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#273140] mr-2"></div>
              Saving draft...
            </div>
          )}
        </div>

        <ContactAndSubmitSection
          formData={formData}
          handleInputChange={handleInputChange}
          setFormData={setFormData}
          loading={loading}
          uploadingMedia={uploadingMedia}
        />

        </>)}
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

      <PermissionRequestModal
        isOpen={showPermissionModal}
        onClose={() => {
          setShowPermissionModal(false);
          setPermissionRequestMessage('');
        }}
        permissionRequestMessage={permissionRequestMessage}
        setPermissionRequestMessage={setPermissionRequestMessage}
        requestingPermission={requestingPermission}
        onSubmit={handlePermissionRequest}
      />
    </div>
  );
}
