import React, { useState, useEffect } from 'react';
import { Mail, Phone, User, Send } from 'lucide-react';
import { staticPagesService, StaticPage } from '../services/staticPages';
import { sanitizeHtml } from '../utils/sanitize';
import { supabase } from '../config/supabase';
import '@/styles/static-page.css';

interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  message: string;
}

export function Contact() {
  const [pageData, setPageData] = useState<StaticPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<ContactFormData>({
    name: '',
    email: '',
    phone: '',
    message: '',
  });
  const [formStatus, setFormStatus] = useState<{
    type: 'idle' | 'loading' | 'success' | 'error';
    message: string;
  }>({ type: 'idle', message: '' });
  const [errors, setErrors] = useState<Partial<ContactFormData>>({});

  useEffect(() => {
    const loadPageData = async () => {
      try {
        const data = await staticPagesService.getStaticPage('contact');
        setPageData(data);
      } catch (error) {
        console.error('Error loading contact page:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPageData();
  }, []);

  const validateForm = (): boolean => {
    const newErrors: Partial<ContactFormData> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.message.trim()) {
      newErrors.message = 'Message is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setFormStatus({ type: 'loading', message: 'Sending your message...' });

    try {
      const { data, error } = await supabase.functions.invoke('send-contact-message', {
        body: {
          name: formData.name,
          email: formData.email,
          phone: formData.phone || undefined,
          message: formData.message,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to send message');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setFormStatus({
        type: 'success',
        message: 'Thank you for your message! We\'ll get back to you soon.',
      });

      setFormData({
        name: '',
        email: '',
        phone: '',
        message: '',
      });
      setErrors({});
    } catch (error) {
      console.error('Error sending message:', error);
      setFormStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to send message. Please try again.',
      });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error for this field when user starts typing
    if (errors[name as keyof ContactFormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }

    // Clear status when user starts editing again
    if (formStatus.type !== 'idle') {
      setFormStatus({ type: 'idle', message: '' });
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140] mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  if (!pageData) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <p className="text-gray-600">Page not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-[#273140] mb-4">
          {pageData.title}
        </h1>
        <p className="text-xl text-gray-600">
          We're here to help you with all your rental needs
        </p>
      </div>

      {/* Static page content */}
      <div
        className="prose prose-lg max-w-none text-gray-700 static-page-content mb-12 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-[#273140] [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[#273140] [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-[#273140] [&_h3]:mb-2 [&_a]:text-[#273140] [&_a]:underline hover:[&_a]:text-[#1e252f]"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(pageData.content) }}
      />

      {/* Contact Form */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-8 mt-12">
        <h2 className="text-2xl font-bold text-[#273140] mb-6 text-center">Send Us a Message</h2>

        {formStatus.message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              formStatus.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : formStatus.type === 'error'
                ? 'bg-red-50 border border-red-200 text-red-800'
                : 'bg-blue-50 border border-blue-200 text-blue-800'
            }`}
          >
            {formStatus.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name Field */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Name *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={`block w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Your full name"
              />
            </div>
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
          </div>

          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={`block w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 ${
                  errors.email ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="your.email@example.com"
              />
            </div>
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
          </div>

          {/* Phone Field (Optional) */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
              Phone Number (Optional)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Phone className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500"
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* Message Field */}
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
              Message *
            </label>
            <textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleChange}
              rows={6}
              className={`block w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 ${
                errors.message ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Tell us how we can help you..."
            />
            {errors.message && <p className="mt-1 text-sm text-red-600">{errors.message}</p>}
          </div>

          {/* Submit Button */}
          <div>
            <button
              type="submit"
              disabled={formStatus.type === 'loading'}
              className="w-full flex items-center justify-center gap-2 bg-accent-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {formStatus.type === 'loading' ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  Send Message
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}