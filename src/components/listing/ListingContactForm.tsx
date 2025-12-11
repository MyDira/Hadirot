import React, { useState } from 'react';
import { Phone } from 'lucide-react';
import { supabase } from '@/config/supabase';

interface ListingContactFormProps {
  listingId: string;
  onSuccess?: () => void;
}

export function ListingContactForm({ listingId, onSuccess }: ListingContactFormProps) {
  const [formData, setFormData] = useState({
    userName: '',
    userPhone: '',
    consentToFollowup: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState({
    userName: '',
    userPhone: '',
  });

  const formatPhoneInput = (value: string): string => {
    const cleaned = value.replace(/\D/g, '');

    if (cleaned.length <= 3) {
      return cleaned;
    } else if (cleaned.length <= 6) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    } else {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
    }
  };

  const validateForm = (): boolean => {
    const errors = {
      userName: '',
      userPhone: '',
    };
    let isValid = true;

    if (!formData.userName.trim()) {
      errors.userName = 'Name is required';
      isValid = false;
    } else if (formData.userName.trim().length < 2) {
      errors.userName = 'Name must be at least 2 characters';
      isValid = false;
    }

    const cleanedPhone = formData.userPhone.replace(/\D/g, '');
    if (!formData.userPhone) {
      errors.userPhone = 'Phone number is required';
      isValid = false;
    } else if (cleanedPhone.length !== 10) {
      errors.userPhone = 'Please enter a valid 10-digit phone number';
      isValid = false;
    }

    setValidationErrors(errors);
    return isValid;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneInput(e.target.value);
    setFormData({ ...formData, userPhone: formatted });
    if (validationErrors.userPhone) {
      setValidationErrors({ ...validationErrors, userPhone: '' });
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, userName: e.target.value });
    if (validationErrors.userName) {
      setValidationErrors({ ...validationErrors, userName: '' });
    }
  };

  const getSessionId = (): string => {
    let sessionId = sessionStorage.getItem('analytics_session_id');
    if (!sessionId) {
      sessionId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      sessionStorage.setItem('analytics_session_id', sessionId);
    }
    return sessionId;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-listing-contact-sms`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          listingId,
          userName: formData.userName.trim(),
          userPhone: formData.userPhone,
          consentToFollowup: formData.consentToFollowup,
          sessionId: getSessionId(),
          userAgent: navigator.userAgent,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send contact request');
      }

      setSuccess(true);
      setFormData({ userName: '', userPhone: '', consentToFollowup: true });

      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => {
        setSuccess(false);
      }, 5000);
    } catch (err) {
      console.error('Error submitting contact form:', err);
      setError(err instanceof Error ? err.message : 'Failed to send contact request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
        <div className="text-green-800 font-semibold mb-2">Request Sent!</div>
        <p className="text-green-700 text-sm">
          The property owner will contact you shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-1">
          Your Name
        </label>
        <input
          type="text"
          id="userName"
          value={formData.userName}
          onChange={handleNameChange}
          className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-[#273140] focus:border-transparent ${
            validationErrors.userName ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="Enter your name"
          disabled={loading}
        />
        {validationErrors.userName && (
          <p className="text-red-500 text-xs mt-1">{validationErrors.userName}</p>
        )}
      </div>

      <div>
        <label htmlFor="userPhone" className="block text-sm font-medium text-gray-700 mb-1">
          Your Phone Number
        </label>
        <input
          type="tel"
          id="userPhone"
          value={formData.userPhone}
          onChange={handlePhoneChange}
          className={`w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-[#273140] focus:border-transparent ${
            validationErrors.userPhone ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="(555) 123-4567"
          disabled={loading}
          maxLength={14}
        />
        {validationErrors.userPhone && (
          <p className="text-red-500 text-xs mt-1">{validationErrors.userPhone}</p>
        )}
      </div>

      <div className="flex items-start">
        <input
          type="checkbox"
          id="consentToFollowup"
          checked={formData.consentToFollowup}
          onChange={(e) => setFormData({ ...formData, consentToFollowup: e.target.checked })}
          className="mt-1 h-4 w-4 text-[#273140] border-gray-300 rounded focus:ring-[#273140]"
          disabled={loading}
        />
        <label htmlFor="consentToFollowup" className="ml-2 text-sm text-gray-600 leading-relaxed">
          I'd like to receive updates and property information via WhatsApp
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-accent-500 text-white py-3 px-4 rounded-md font-semibold hover:bg-accent-600 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
            Sending...
          </>
        ) : (
          <>
            <Phone className="w-5 h-5 mr-2" />
            Request Callback
          </>
        )}
      </button>
    </form>
  );
}
