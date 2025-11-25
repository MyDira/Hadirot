import { StrictMode } from "react";
import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles/global.css";
import { AuthProvider } from "@/hooks/useAuth";

Sentry.init({
  dsn: "https://ca3ceb8f19fa68cf58690ab12f4cf76d@o4510417390534656.ingest.us.sentry.io/4510417418125312",

  // Environment configuration
  environment: import.meta.env.MODE || 'production',

  // Performance monitoring
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Performance monitoring sample rates
  tracesSampleRate: 0.1, // 10% of transactions for performance monitoring

  // Session replay sample rates
  replaysSessionSampleRate: 0.1, // 10% of sessions
  replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // PII filtering - we'll sanitize sensitive data in beforeSend
  sendDefaultPii: false,

  // Filter and sanitize events before sending
  beforeSend(event, hint) {
    // Filter out browser extension errors
    if (event.exception?.values) {
      const isExtensionError = event.exception.values.some(
        (exception) =>
          exception.stacktrace?.frames?.some(
            (frame) =>
              frame.filename?.includes('chrome-extension://') ||
              frame.filename?.includes('moz-extension://') ||
              frame.filename?.includes('safari-extension://')
          )
      );

      if (isExtensionError) {
        return null; // Don't send browser extension errors
      }
    }

    // Sanitize user data to remove PII
    if (event.user) {
      // Keep user ID but remove email and other PII
      const sanitizedUser: any = {
        id: event.user.id,
      };

      // Keep non-PII fields
      if (event.user.role) sanitizedUser.role = event.user.role;

      event.user = sanitizedUser;
    }

    // Sanitize contexts to remove sensitive data
    if (event.contexts) {
      // Remove any phone numbers or emails from contexts
      const sanitizeObject = (obj: any): any => {
        if (!obj || typeof obj !== 'object') return obj;

        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
          // Skip fields that might contain PII
          if (key === 'contact_phone' || key === 'contact_email' || key === 'email' || key === 'phone') {
            sanitized[key] = '[REDACTED]';
          } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeObject(value);
          } else {
            sanitized[key] = value;
          }
        }
        return sanitized;
      };

      event.contexts = sanitizeObject(event.contexts);
    }

    return event;
  },

  // Ignore common non-critical errors
  ignoreErrors: [
    // Network errors that are expected
    'NetworkError',
    'Failed to fetch',
    'Load failed',
    // ResizeObserver errors (harmless browser quirk)
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
  ],
});


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
