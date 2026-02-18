import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { requestPasswordReset } from "../../services/email";

interface AuthFormProps {
  onAuthSuccess?: () => void;
}

export function AuthForm({ onAuthSuccess }: AuthFormProps = {}) {
  const location = useLocation();
  const [isSignUp, setIsSignUp] = useState(location.state?.isSignUp || false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [signInTemporarilyDisabled, setSignInTemporarilyDisabled] =
    useState(true);
  const mountTsRef = useRef<number>(0);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "tenant" as const,
    phone: "",
    agency: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignUp) {
      const elapsed = performance.now() - (mountTsRef.current || 0);
      if (elapsed < 350 || signInTemporarilyDisabled) return;
    }
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        await signUp(formData.email, formData.password, {
          full_name: formData.full_name,
          role: formData.role,
          phone: formData.phone || undefined,
          agency: formData.role === "agent" ? formData.agency : undefined,
        });
      } else {
        await signIn(formData.email, formData.password);
      }

      if (onAuthSuccess) {
        onAuthSuccess();
      } else {
        navigate(location.state?.from || "/");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSignUp && !showForgotPassword) {
      setSignInTemporarilyDisabled(true);
      mountTsRef.current = performance.now();
      const t = setTimeout(() => setSignInTemporarilyDisabled(false), 350);
      return () => clearTimeout(t);
    }
  }, [isSignUp, showForgotPassword]);

  const onClickSignIn = (e: React.MouseEvent<HTMLButtonElement>) => {
    const elapsed = performance.now() - (mountTsRef.current || 0);
    if (elapsed < 350 || signInTemporarilyDisabled) return;
    handleSubmit(e as any);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setError(null);
    setResetMessage(null);

    try {
      await requestPasswordReset(resetEmail);
      setResetMessage(
        "Password reset email sent! Check your inbox for the reset link.",
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);

    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || "Failed to sign in with Google");
      setGoogleLoading(false);
    }
  };

  return (
    <div className="bg-gray-50 flex flex-col justify-center py-8 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="text-center text-3xl font-bold text-gray-900">
          {isSignUp ? "Create your account" : "Sign in to your account"}
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
                <label
                  htmlFor="reset-email"
                  className="block text-sm font-medium text-gray-700"
                >
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
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-accent-500 hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#273140] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {resetLoading ? "Sending..." : "Send Reset Email"}
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setError(null);
                    setResetMessage(null);
                    setResetEmail("");
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

              <div>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading || loading}
                  className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-gray-700 font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#273140] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  {googleLoading ? "Signing in..." : "Sign in with Google"}
                </button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Or continue with email</span>
                </div>
              </div>

              {isSignUp && (
                <>
                  <div>
                    <label
                      htmlFor="full_name"
                      className="block text-sm font-medium text-gray-700"
                    >
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
                    <label
                      htmlFor="role"
                      className="block text-sm font-medium text-gray-700"
                    >
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

                  {formData.role === "agent" && (
                    <div>
                      <label
                        htmlFor="agency"
                        className="block text-sm font-medium text-gray-700"
                      >
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
                    <label
                      htmlFor="phone"
                      className="block text-sm font-medium text-gray-700"
                    >
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
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700"
                >
                  Email Address
                </label>
                <input
                  ref={emailInputRef}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#273140] focus:border-[#273140]"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <div className="mt-1 relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      isSignUp ? "new-password" : "current-password"
                    }
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

              {isSignUp && (
                <div className="text-center text-xs text-gray-600">
                  By signing up, you agree to our{" "}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#273140] underline hover:text-[#1e252f] transition-colors"
                  >
                    Privacy Policy
                  </a>
                  {" "}and{" "}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#273140] underline hover:text-[#1e252f] transition-colors"
                  >
                    Terms of Use
                  </a>
                </div>
              )}

              <div>
                <button
                  type={isSignUp ? "submit" : "button"}
                  disabled={
                    loading || (!isSignUp && signInTemporarilyDisabled)
                  }
                  onClick={!isSignUp ? onClickSignIn : undefined}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-accent-500 hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4E4B43] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading
                    ? "Please wait..."
                    : isSignUp
                      ? "Create Account"
                      : "Sign In"}
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
                  {isSignUp
                    ? "Already have an account? Sign in"
                    : "Don't have an account? Sign up"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
