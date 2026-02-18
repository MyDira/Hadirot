import React from "react";
import type { ListingFormData } from "./types";

interface RentalPropertyDetailsProps {
  formData: ListingFormData;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  handleMainBedroomChange: (value: string) => void;
  handleAdditionalRoomsChange: (value: string) => void;
  handleApartmentConditionToggle: (condition: string) => void;
  handleCallForPriceChange: (checked: boolean) => void;
  handlePriceChange: (value: string) => void;
  handleUtilityToggle: (utility: string) => void;
  priceError: string | null;
}

export function RentalPropertyDetails({
  formData,
  handleInputChange,
  handleMainBedroomChange,
  handleAdditionalRoomsChange,
  handleApartmentConditionToggle,
  handleCallForPriceChange,
  handlePriceChange,
  handleUtilityToggle,
  priceError,
}: RentalPropertyDetailsProps) {
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 relative transition-all ${
      !formData.listing_type ? 'opacity-40 pointer-events-none' : ''
    }`}>
      <h2 className="text-xl font-semibold text-brand-700 mb-4">
        Property Details
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {formData.listing_type === 'rental' && (
          <>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Monthly Rent ($) *
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={formData.price ?? ''}
                onChange={(e) => handlePriceChange(e.target.value)}
                disabled={formData.call_for_price}
                required={!formData.call_for_price}
                className={`w-full px-3 py-2 border rounded-md focus:ring-brand-700 focus:border-brand-700 ${
                  priceError && !formData.call_for_price ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="2500"
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
          </>
        )}

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
              <option value="long_term_annual">Long Term/Annual</option>
              <option value="summer_rental">Summer Rental</option>
              <option value="winter_rental">Winter Rental</option>
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

        {formData.listing_type === 'rental' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Air Conditioning
            </label>
            <select
              name="ac_type"
              value={formData.ac_type || ''}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-brand-700 focus:border-brand-700"
            >
              <option value="">Select AC type (optional)</option>
              <option value="central">Central Air</option>
              <option value="split_unit">Split Unit</option>
              <option value="window">Window Unit</option>
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
        </div>
      )}

      {formData.listing_type === 'rental' && (
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Utilities Included
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {['Heat', 'Hot Water', 'Gas', 'Electric', 'Water/Sewer', 'Internet'].map((utility) => (
              <label key={utility} className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.utilities_included?.includes(utility.toLowerCase().replace('/', '_').replace(' ', '_')) || false}
                  onChange={() => handleUtilityToggle(utility.toLowerCase().replace('/', '_').replace(' ', '_'))}
                  className="h-4 w-4 text-brand-700 focus:ring-[#273140] border-gray-300 rounded mr-2"
                />
                <span className="text-sm text-gray-700">{utility}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
