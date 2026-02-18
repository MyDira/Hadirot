import React from "react";
import { UserSearchSelect } from "../../components/admin/UserSearchSelect";
import type { Profile } from "../../config/supabase";

interface AdminAssignmentSectionProps {
  adminAssignUser: Profile | null;
  setAdminAssignUser: (v: Profile | null) => void;
  adminCustomAgencyName: string;
  setAdminCustomAgencyName: (v: string) => void;
  adminListingTypeDisplay: 'agent' | 'owner' | '';
  setAdminListingTypeDisplay: (v: 'agent' | 'owner' | '') => void;
}

export function AdminAssignmentSection({
  adminAssignUser,
  setAdminAssignUser,
  adminCustomAgencyName,
  setAdminCustomAgencyName,
  adminListingTypeDisplay,
  setAdminListingTypeDisplay,
}: AdminAssignmentSectionProps) {
  return (
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
            Assign this listing to another user or customize display settings
          </p>
        </div>
      </div>

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
  );
}
