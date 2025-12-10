import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  PropertyCondition,
  OccupancyStatus,
  DeliveryCondition,
  BasementType,
  LaundryType,
  RentRollUnit
} from '../../config/supabase';

interface SalesListingFieldsProps {
  formData: any;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  handleOutdoorSpaceToggle: (space: string) => void;
  handleInteriorFeatureToggle: (feature: string) => void;
  handleApplianceToggle: (appliance: string) => void;
  handleUtilityToggle: (utility: string) => void;
  handleRentRollUnitChange: (index: number, field: keyof RentRollUnit, value: string | number) => void;
  addRentRollUnit: () => void;
  removeRentRollUnit: (index: number) => void;
  handleLotSizeModeChange: (mode: 'sqft' | 'dimensions') => void;
  calculateLotSize: () => number | null;
}

export function SalesListingFields({
  formData,
  handleInputChange,
  handleOutdoorSpaceToggle,
  handleInteriorFeatureToggle,
  handleApplianceToggle,
  handleUtilityToggle,
  handleRentRollUnitChange,
  addRentRollUnit,
  removeRentRollUnit,
  handleLotSizeModeChange,
  calculateLotSize,
}: SalesListingFieldsProps) {
  const isMultiFamily = ['semi_attached_house', 'fully_attached_townhouse', 'condo'].includes(formData.property_type);

  return (
    <>
      {/* Property Specifications for Sales */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Property Specifications</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Interior Square Footage *
            </label>
            <input
              type="number"
              name="square_footage"
              value={formData.square_footage || ''}
              onChange={handleInputChange}
              required
              min="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
              placeholder="1500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of Floors *
            </label>
            <input
              type="number"
              name="number_of_floors"
              value={formData.number_of_floors || ''}
              onChange={handleInputChange}
              required
              min="1"
              max="10"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
              placeholder="2"
            />
          </div>

          {isMultiFamily && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Number of Units *
              </label>
              <input
                type="number"
                name="unit_count"
                value={formData.unit_count || ''}
                onChange={handleInputChange}
                required
                min="2"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                placeholder="2"
              />
            </div>
          )}

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Lot Size *
            </label>
            <div className="flex gap-4 mb-3">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={formData.lot_size_input_mode === 'sqft'}
                  onChange={() => handleLotSizeModeChange('sqft')}
                  className="mr-2"
                />
                Square Feet
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={formData.lot_size_input_mode === 'dimensions'}
                  onChange={() => handleLotSizeModeChange('dimensions')}
                  className="mr-2"
                />
                Dimensions
              </label>
            </div>

            {formData.lot_size_input_mode === 'sqft' ? (
              <input
                type="number"
                name="lot_size_sqft"
                value={formData.lot_size_sqft || ''}
                onChange={handleInputChange}
                required
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                placeholder="5000"
              />
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Length (ft) *</label>
                  <input
                    type="number"
                    name="property_length_ft"
                    value={formData.property_length_ft || ''}
                    onChange={handleInputChange}
                    required
                    min="1"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                    placeholder="100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Width (ft) *</label>
                  <input
                    type="number"
                    name="property_width_ft"
                    value={formData.property_width_ft || ''}
                    onChange={handleInputChange}
                    required
                    min="1"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                    placeholder="50"
                  />
                </div>
                {calculateLotSize() && (
                  <div className="col-span-2 text-sm text-gray-600">
                    Calculated: {calculateLotSize()?.toLocaleString()} sq ft
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Property Condition & Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Property Condition & Status</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Property Condition *
            </label>
            <select
              name="property_condition"
              value={formData.property_condition || ''}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
            >
              <option value="">Select Condition</option>
              <option value="excellent">Excellent</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="needs_work">Needs Work</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Occupancy Status *
            </label>
            <select
              name="occupancy_status"
              value={formData.occupancy_status || ''}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
            >
              <option value="">Select Status</option>
              <option value="owner_occupied">Owner Occupied</option>
              <option value="tenant_occupied">Tenant Occupied</option>
              <option value="vacant">Vacant</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Delivery Condition *
            </label>
            <select
              name="delivery_condition"
              value={formData.delivery_condition || ''}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
            >
              <option value="">Select Delivery</option>
              <option value="vacant_at_closing">Vacant at Closing</option>
              <option value="subject_to_lease">Subject to Lease</option>
              <option value="negotiable">Negotiable</option>
            </select>
          </div>
        </div>
      </div>

      {/* Optional Features Section */}
      <details className="bg-white rounded-lg shadow">
        <summary className="p-6 cursor-pointer font-semibold text-lg text-gray-900 hover:text-gray-700">
          Optional Property Features (Click to expand)
        </summary>
        <div className="px-6 pb-6 space-y-6">
          {/* Year Built & Renovated */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Year Built
              </label>
              <input
                type="number"
                name="year_built"
                value={formData.year_built || ''}
                onChange={handleInputChange}
                min="1800"
                max={new Date().getFullYear() + 5}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                placeholder="1950"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Year Renovated
              </label>
              <input
                type="number"
                name="year_renovated"
                value={formData.year_renovated || ''}
                onChange={handleInputChange}
                min="1800"
                max={new Date().getFullYear() + 5}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                placeholder="2020"
              />
            </div>
          </div>

          {/* Outdoor Space */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Outdoor Space
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {['Balcony', 'Terrace', 'Patio', 'Backyard', 'Roof Deck', 'Shared Yard'].map((space) => (
                <label key={space} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.outdoor_space?.includes(space.toLowerCase().replace(' ', '_')) || false}
                    onChange={() => handleOutdoorSpaceToggle(space.toLowerCase().replace(' ', '_'))}
                    className="mr-2"
                  />
                  {space}
                </label>
              ))}
            </div>
          </div>

          {/* Interior Features */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Interior Features
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                'Hardwood Floors',
                'Crown Molding',
                'High Ceilings (10ft+)',
                'Fireplace',
                'Walk-in Closet',
                'Built-in Storage',
                'Exposed Brick',
                'Herringbone Floors',
                'Coffered Ceilings'
              ].map((feature) => (
                <label key={feature} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.interior_features?.includes(feature.toLowerCase().replace(/[^a-z0-9]+/g, '_')) || false}
                    onChange={() => handleInteriorFeatureToggle(feature.toLowerCase().replace(/[^a-z0-9]+/g, '_'))}
                    className="mr-2"
                  />
                  {feature}
                </label>
              ))}
            </div>
          </div>

          {/* Appliances */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Appliances Included
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {['Refrigerator', 'Stove/Oven', 'Dishwasher', 'Microwave', 'Washer', 'Dryer', 'Garbage Disposal'].map((appliance) => (
                <label key={appliance} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.apartment_conditions?.includes(appliance.toLowerCase().replace(/[^a-z]+/g, '_')) || false}
                    onChange={() => handleApplianceToggle(appliance.toLowerCase().replace(/[^a-z]+/g, '_'))}
                    className="mr-2"
                  />
                  {appliance}
                </label>
              ))}
            </div>
          </div>

          {/* Laundry */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Laundry
            </label>
            <select
              name="laundry_type"
              value={formData.laundry_type || ''}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
            >
              <option value="">Select Laundry Type</option>
              <option value="in_unit">In-Unit</option>
              <option value="hookups_only">Hookups Only</option>
              <option value="common_area">Common Area</option>
              <option value="none">None</option>
            </select>
          </div>

          {/* Basement */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Basement Type
            </label>
            <select
              name="basement_type"
              value={formData.basement_type || ''}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
            >
              <option value="">Select Basement Type</option>
              <option value="finished">Finished</option>
              <option value="unfinished">Unfinished</option>
              <option value="partially_finished">Partially Finished</option>
              <option value="walkout">Walkout</option>
              <option value="none">None</option>
            </select>
          </div>

          {formData.basement_type && formData.basement_type !== 'none' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Basement Notes
              </label>
              <textarea
                name="basement_notes"
                value={formData.basement_notes || ''}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                placeholder="Ceiling height, features, additional details..."
              />
            </div>
          )}
        </div>
      </details>

      {/* Financial Information */}
      <details className="bg-white rounded-lg shadow">
        <summary className="p-6 cursor-pointer font-semibold text-lg text-gray-900 hover:text-gray-700">
          Optional Financial Information (Click to expand)
        </summary>
        <div className="px-6 pb-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Annual Property Taxes
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="number"
                  name="property_taxes"
                  value={formData.property_taxes || ''}
                  onChange={handleInputChange}
                  min="0"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  placeholder="5000"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {formData.property_type === 'co_op' ? 'Monthly Maintenance' : 'HOA Fees (Monthly)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="number"
                  name="hoa_fees"
                  value={formData.hoa_fees || ''}
                  onChange={handleInputChange}
                  min="0"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  placeholder="200"
                />
              </div>
            </div>
          </div>
        </div>
      </details>

      {/* Multi-Family Information */}
      {isMultiFamily && (
        <details className="bg-white rounded-lg shadow">
          <summary className="p-6 cursor-pointer font-semibold text-lg text-gray-900 hover:text-gray-700">
            Optional Multi-Family Information (Click to expand)
          </summary>
          <div className="px-6 pb-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total Monthly Rent Roll
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="number"
                  name="rent_roll_total"
                  value={formData.rent_roll_total || ''}
                  onChange={handleInputChange}
                  min="0"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  placeholder="4000"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Per-Unit Rent Breakdown
                </label>
                <button
                  type="button"
                  onClick={addRentRollUnit}
                  className="flex items-center text-sm text-[#273140] hover:text-[#1a2230]"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Unit
                </button>
              </div>
              {formData.rent_roll_data.map((unit: RentRollUnit, index: number) => (
                <div key={index} className="grid grid-cols-4 gap-3 mb-3">
                  <input
                    type="text"
                    value={unit.unit}
                    onChange={(e) => handleRentRollUnitChange(index, 'unit', e.target.value)}
                    placeholder="Unit #"
                    className="px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  />
                  <input
                    type="number"
                    value={unit.bedrooms}
                    onChange={(e) => handleRentRollUnitChange(index, 'bedrooms', parseInt(e.target.value))}
                    placeholder="Beds"
                    min="0"
                    className="px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  />
                  <input
                    type="number"
                    value={unit.rent}
                    onChange={(e) => handleRentRollUnitChange(index, 'rent', parseFloat(e.target.value))}
                    placeholder="Rent"
                    min="0"
                    className="px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  />
                  <button
                    type="button"
                    onClick={() => removeRentRollUnit(index)}
                    className="flex items-center justify-center text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Utilities Included
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {['Heat', 'Hot Water', 'Gas', 'Electric', 'Water/Sewer', 'Internet'].map((utility) => (
                  <label key={utility} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.utilities_included?.includes(utility.toLowerCase().replace('/', '_')) || false}
                      onChange={() => handleUtilityToggle(utility.toLowerCase().replace('/', '_'))}
                      className="mr-2"
                    />
                    {utility}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tenant Notes
              </label>
              <textarea
                name="tenant_notes"
                value={formData.tenant_notes || ''}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                placeholder="Lease details, tenant information, etc..."
              />
            </div>
          </div>
        </details>
      )}
    </>
  );
}
