import React from 'react';
import type { Profile } from '../../config/supabase';
import type { MediaFile } from '../../components/shared/MediaUploader';
import type { CommercialListingFormData } from '../postCommercial/commercialTypes';
import type { GoogleStreetFeature } from '../../components/listing/GoogleStreetAutocomplete';
import { Step1CommercialTypeAndPricing } from './steps/commercial/Step1CommercialTypeAndPricing';
import { Step2CommercialShowItOff } from './steps/commercial/Step2CommercialShowItOff';
import { Step3CommercialLocation } from './steps/commercial/Step3CommercialLocation';
import { Step4CommercialSpaceDetails } from './steps/commercial/Step4CommercialSpaceDetails';
import { Step5CommercialOptionalDetails } from './steps/commercial/Step5CommercialOptionalDetails';
import { Step6CommercialContactAndReview } from './steps/commercial/Step6CommercialContactAndReview';

interface Props {
  currentStep: number;
  formData: CommercialListingFormData;
  updateFormData: (u: Partial<CommercialListingFormData>) => void;
  isSale: boolean;
  onNext: () => void;
  onBack: () => void;

  mediaFiles: MediaFile[];
  uploadingMedia: boolean;
  onMediaAdd: (files: File[]) => void;
  onMediaRemove: (id: string) => void;
  onSetFeatured: (id: string) => void;
  maxAllowedFiles: number;

  crossStreetAFeature: GoogleStreetFeature | null;
  setCrossStreetAFeature: (f: GoogleStreetFeature | null) => void;
  crossStreetBFeature: GoogleStreetFeature | null;
  setCrossStreetBFeature: (f: GoogleStreetFeature | null) => void;
  neighborhoodSelectValue: string;
  setNeighborhoodSelectValue: (v: string) => void;
  customNeighborhoodInput: string;
  setCustomNeighborhoodInput: (v: string) => void;
  isLocationConfirmed: boolean;
  setIsLocationConfirmed: (v: boolean) => void;

  resolvedNeighborhood: string;
  loading: boolean;
  submitError: string | null;
  onSubmit: () => void;
  profile: Profile | null;
}

export function CommercialStepsRouter(props: Props) {
  const baseProps = {
    formData: props.formData,
    updateFormData: props.updateFormData,
    isSale: props.isSale,
    onNext: props.onNext,
    onBack: props.onBack,
  };

  switch (props.currentStep) {
    case 0:
      return <Step1CommercialTypeAndPricing {...baseProps} />;
    case 1:
      return (
        <Step2CommercialShowItOff
          {...baseProps}
          mediaFiles={props.mediaFiles}
          uploadingMedia={props.uploadingMedia}
          onMediaAdd={props.onMediaAdd}
          onMediaRemove={props.onMediaRemove}
          onSetFeatured={props.onSetFeatured}
          maxAllowedFiles={props.maxAllowedFiles}
        />
      );
    case 2:
      return (
        <Step3CommercialLocation
          {...baseProps}
          crossStreetAFeature={props.crossStreetAFeature}
          setCrossStreetAFeature={props.setCrossStreetAFeature}
          crossStreetBFeature={props.crossStreetBFeature}
          setCrossStreetBFeature={props.setCrossStreetBFeature}
          neighborhoodSelectValue={props.neighborhoodSelectValue}
          setNeighborhoodSelectValue={props.setNeighborhoodSelectValue}
          customNeighborhoodInput={props.customNeighborhoodInput}
          setCustomNeighborhoodInput={props.setCustomNeighborhoodInput}
          isLocationConfirmed={props.isLocationConfirmed}
          setIsLocationConfirmed={props.setIsLocationConfirmed}
        />
      );
    case 3:
      return <Step4CommercialSpaceDetails {...baseProps} />;
    case 4:
      return <Step5CommercialOptionalDetails {...baseProps} />;
    case 5:
      return (
        <Step6CommercialContactAndReview
          {...baseProps}
          mediaFiles={props.mediaFiles}
          resolvedNeighborhood={props.resolvedNeighborhood}
          loading={props.loading}
          uploadingMedia={props.uploadingMedia}
          submitError={props.submitError}
          onSubmit={props.onSubmit}
          profile={props.profile}
        />
      );
    default:
      return null;
  }
}
