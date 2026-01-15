import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { formatPhoneNumber } from '@/utils/formatters';

interface PhoneNumberRevealProps {
  phoneNumber: string;
  listingId: string;
  onReveal: () => void;
  isMobile?: boolean;
}

function maskPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');

  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ***-****`;
  }

  if (phone.length > 4) {
    return phone.slice(0, -4) + '****';
  }

  return '***-****';
}

function getStorageKey(listingId: string): string {
  return `phone_revealed_${listingId}`;
}

function isPhoneRevealed(listingId: string): boolean {
  try {
    return sessionStorage.getItem(getStorageKey(listingId)) === 'true';
  } catch {
    return false;
  }
}

function setPhoneRevealed(listingId: string): void {
  try {
    sessionStorage.setItem(getStorageKey(listingId), 'true');
  } catch {
    // Ignore storage errors
  }
}

export function PhoneNumberReveal({
  phoneNumber,
  listingId,
  onReveal,
  isMobile = false,
}: PhoneNumberRevealProps) {
  const [isRevealed, setIsRevealed] = useState(() => isPhoneRevealed(listingId));

  const handleReveal = () => {
    if (!isRevealed) {
      onReveal();
      setIsRevealed(true);
      setPhoneRevealed(listingId);
    }
  };

  const formattedPhone = formatPhoneNumber(phoneNumber);
  const maskedPhone = maskPhoneNumber(phoneNumber);

  return (
    <span className="inline-flex items-center gap-2">
      {isRevealed ? (
        isMobile ? (
          <a
            href={`tel:${phoneNumber}`}
            className="text-[#273140] hover:text-[#1e252f] font-medium transition-colors hover:underline"
          >
            {formattedPhone}
          </a>
        ) : (
          <span className="text-[#273140] font-medium">{formattedPhone}</span>
        )
      ) : (
        <span className="text-[#273140] font-medium">{maskedPhone}</span>
      )}

      <button
        type="button"
        onClick={handleReveal}
        className="p-2 -m-2 rounded-full hover:bg-gray-100 transition-colors"
        aria-label={isRevealed ? 'Phone number revealed' : 'Reveal phone number'}
      >
        {isRevealed ? (
          <EyeOff className="w-4 h-4 text-accent-500" />
        ) : (
          <Eye className="w-4 h-4 text-gray-400 hover:text-accent-500 transition-colors" />
        )}
      </button>
    </span>
  );
}
