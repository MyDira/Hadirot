import React from 'react';
import { X } from 'lucide-react';
import type { ModalPopup } from '../../services/modals';

interface CustomModalProps {
  modal: ModalPopup;
  isOpen: boolean;
  onClose: () => void;
  onButtonClick: () => void;
}

export function CustomModal({ modal, isOpen, onClose, onButtonClick }: CustomModalProps) {
  if (!isOpen) return null;

  const handleButtonClick = () => {
    onButtonClick();
    window.open(modal.button_url, '_blank', 'noopener,noreferrer');
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-auto overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-[#273140]">{modal.heading}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {modal.subheading && (
            <p className="text-base text-gray-700 font-medium">{modal.subheading}</p>
          )}

          {modal.additional_text_lines && modal.additional_text_lines.length > 0 && (
            <div className="space-y-2">
              {modal.additional_text_lines.map((line, index) => (
                <p key={index} className="text-sm text-gray-600">
                  {line}
                </p>
              ))}
            </div>
          )}

          <div className="pt-4">
            <button
              onClick={handleButtonClick}
              className="w-full bg-[#273140] text-white px-6 py-3 rounded-md font-medium hover:bg-[#1e252f] transition-colors focus:outline-none focus:ring-2 focus:ring-[#273140] focus:ring-offset-2"
            >
              {modal.button_text}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
