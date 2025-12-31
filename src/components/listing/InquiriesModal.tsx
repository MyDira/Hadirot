import React from 'react';
import { X, Phone, User, Calendar } from 'lucide-react';

export interface Inquiry {
  user_name: string;
  user_phone: string;
  created_at: string;
}

interface InquiriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  listingTitle: string;
  inquiries: Inquiry[];
  loading: boolean;
}

export function InquiriesModal({ isOpen, onClose, listingTitle, inquiries, loading }: InquiriesModalProps) {
  if (!isOpen) return null;

  const formatDate = (dateString: string): string => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatPhoneForTel = (phone: string): string => {
    return phone.replace(/\D/g, '');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inquiries-modal-title"
    >
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-auto my-8 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 id="inquiries-modal-title" className="text-lg font-semibold text-[#273140]">
            Inquiries for {listingTitle}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[70vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140]"></div>
              <span className="ml-3 text-gray-600">Loading inquiries...</span>
            </div>
          ) : inquiries.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-400 mb-2">
                <Phone className="w-12 h-12 mx-auto" />
              </div>
              <p className="text-gray-600">No inquiries yet for this listing.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {inquiries.map((inquiry, index) => (
                <div
                  key={`${inquiry.user_phone}-${inquiry.created_at}-${index}`}
                  className="bg-gray-50 rounded-lg p-4 border border-gray-100"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-[#273140] rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{inquiry.user_name}</p>
                        <a
                          href={`tel:${formatPhoneForTel(inquiry.user_phone)}`}
                          className="text-accent-600 hover:text-accent-700 flex items-center gap-1 text-sm"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          {inquiry.user_phone}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-500 sm:text-right">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(inquiry.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
