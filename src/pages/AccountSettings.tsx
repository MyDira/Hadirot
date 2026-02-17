// Redirects to unified /account page - content moved to
// src/components/billing/BillingTab.tsx and src/components/account/SettingsTab.tsx
import React from "react";
import { Navigate } from "react-router-dom";

export function AccountSettings() {
  return <Navigate to="/account?tab=settings" replace />;
}
