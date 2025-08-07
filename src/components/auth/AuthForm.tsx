import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { emailService } from '../../services/email';

interface AuthFormProps {
  onAuthSuccess?: () => void;
}

export function AuthForm({ onAuthSuccess }: AuthFormProps = {}) {
  const location = useLocation();
  const [isSignUp, setIsSignUp] = useState(location.state?.isSignUp || false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const emailInputRef = React.useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'tenant' as const,
    phone: '',
    agency: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        await signUp(formData.email, formData.password, {
          full_name: formData.full_name,
          role: formData.role,
          phone: formData.phone || undefined,
          agency: formData.role === 'agent' ? formData.agency : undefined,
        });
      } else {
        await signIn(formData.email, formData.password);
      }
      
      if (onAuthSuccess) {
        onAuthSuccess();
      } else {
        navigate(location.state?.from || '/');
      }
      if (onAuthSuccess) {
        onAuthSuccess();
      } else {
        navigate(location.state?.from || '/');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setError(null);
    setResetMessage(null);

    try {
      console.log('🔄 Sending password reset email to:', resetEmail);
      // Call our email service which handles both Supabase reset and branded email
      const result = await emailService.sendPasswordResetEmail(resetEmail);

      if (!result.success) {
        console.error('❌ Password reset failed:', result.error);
        setError(result.error || 'Failed to send password reset email');
      } else {
        console.log('✅ Password reset email sent successfully');
        setResetMessage('Password reset email sent! Check your inbox for the reset link.');
      }
    } catch (err: any) {
      console.error('❌ Password reset error:', err);
      setError(err.message || 'An error occurred while sending the reset email');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 flex flex-col justify-center py-8 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="text-center text-3xl font-bold text-gray-900">
          {isSignUp ? 'Create your account' : 'Sign in to your account'}
        </h2>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {showForgotPassword ? (
            <form className="space-y-6" onSubmit={handleForgotPassword}>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}
              
              {resetMessage && (
                <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md text-sm">
                  {resetMessage}
                </div>
              )}

              <div>
                <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <input
                  id="reset-email"
                  name="reset-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#273140] focus:border-[#273140]"
                  placeholder="Enter your email address"
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#C5594C] hover:bg-[#b04d42] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#C5594C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {resetLoading ? 'Sending...' : 'Send Reset Email'}
                </button>
              </div>
              
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setError(null);
                    setResetMessage(null);
                    setResetEmail('');
                    // Focus the email input to prevent submit button from getting focus
                    setTimeout(() => {
                      emailInputRef.current?.focus();
                    }, 100);
                  }}
                  className="text-sm text-[#273140] hover:text-[#1e252f] transition-colors"
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            {isSignUp && (
              <>
                <div>
                  <label htmlFor="full_name" className="block text-sm font-medium text-gray-700">
                    Full Name
                  </label>
                  <input
                    id="full_name"
                    name="full_name"
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#273140] focus:border-[#273140]"
                  />
                </div>

                <div>
                  <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                    I am a...
                  </label>
                  <select
                    id="role"
                    name="role"
                    value={formData.role}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                  >
                    <option value="tenant">Tenant</option>
                    <option value="landlord">Landlord</option>
                    <option value="agent">Real Estate Agent</option>
                  </select>
                </div>

                {formData.role === 'agent' && (
                  <div>
                    <label htmlFor="agency" className="block text-sm font-medium text-gray-700">
                      Agency Name *
                    </label>
                    <input
                      id="agency"
                      name="agency"
                      type="text"
                      required
                      value={formData.agency}
                      onChange={handleInputChange}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                    Phone Number (Optional)
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#4E4B43] focus:border-[#4E4B43]"
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                ref={emailInputRef}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#273140] focus:border-[#273140]"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  className="block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#273140] focus:border-[#273140]"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#4E4B43] hover:bg-[#3a3832] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4E4B43] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Please wait...' : (isSignUp ? 'Create Account' : 'Sign In')}
              </button>
            </div>
          </form>
          )}

          {!showForgotPassword && (
            <div className="mt-6">
              {!isSignUp && (
                <div className="text-center mb-4">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-sm text-[#273140] hover:text-[#1e252f] transition-colors"
                  >
                    Forgot your password?
                  </button>
                </div>
              )}
              
          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-[#273140] hover:text-[#1e252f] transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}