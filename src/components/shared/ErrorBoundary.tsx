import React from "react";
import * as Sentry from "@sentry/react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
          Something went wrong
        </h1>

        <p className="text-gray-600 text-center mb-6">
          We're sorry for the inconvenience. An unexpected error has occurred.
        </p>

        {import.meta.env.MODE === 'development' && (
          <div className="bg-gray-100 rounded-lg p-4 mb-6 overflow-auto">
            <p className="text-sm font-mono text-gray-800 break-words">
              {error.message}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={resetError}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-accent-500 text-white rounded-md font-semibold hover:bg-accent-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>

          <a
            href="/"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-200 text-gray-800 rounded-md font-semibold hover:bg-gray-300 transition-colors"
          >
            <Home className="w-4 h-4" />
            Go Home
          </a>
        </div>

        <p className="text-xs text-gray-500 text-center mt-6">
          This error has been automatically reported to our team.
        </p>
      </div>
    </div>
  );
}

// Create the error boundary using Sentry's wrapper
export const ErrorBoundary = Sentry.withErrorBoundary(
  ({ children }: { children: React.ReactNode }) => <>{children}</>,
  {
    fallback: ({ error, resetError }) => (
      <ErrorFallback error={error} resetError={resetError} />
    ),
    showDialog: false,
    beforeCapture: (scope) => {
      scope.setTag("error_boundary", "app_level");
    },
  }
);

export default ErrorBoundary;
