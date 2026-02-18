import React from "react";
import { Modal } from "../../components/shared/Modal";

interface PermissionRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  permissionRequestMessage: string;
  setPermissionRequestMessage: (v: string) => void;
  requestingPermission: boolean;
  onSubmit: () => void;
}

export function PermissionRequestModal({
  isOpen,
  onClose,
  permissionRequestMessage,
  setPermissionRequestMessage,
  requestingPermission,
  onSubmit,
}: PermissionRequestModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
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
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={requestingPermission || !permissionRequestMessage.trim()}
            className="px-4 py-2 bg-brand-700 text-white rounded-md hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {requestingPermission ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
