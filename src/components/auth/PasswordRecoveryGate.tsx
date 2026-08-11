import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, initialUrlHash, initialUrlSearch } from "@/config/supabase";
import { requestPasswordReset } from "../../services/email";

type PasswordRecoveryGateProps = {
  children: React.ReactNode;
  onSuccessPath?: string;
};

// Read from the hash/search captured at module-load time (see
// config/supabase.ts), not from the live window.location. Constructing the
// Supabase client kicks off async processing that, for a valid recovery
// link, establishes the session and clears location.hash — often before
// React's first render. Reading the live URL here would frequently lose
// that race and silently miss the recovery link.
function readCapturedParam(name: string): string | null {
  const searchParams = new URLSearchParams(initialUrlSearch);
  const hashParams = new URLSearchParams(initialUrlHash.replace(/^#/, ""));
  return searchParams.get(name) ?? hashParams.get(name);
}

const initialIsRecovery = readCapturedParam("type") === "recovery";

const initialUrlError = (() => {
  const error = readCapturedParam("error");
  const errorCode = readCapturedParam("error_code");
  if (!error && !errorCode) return null;
  const description = readCapturedParam("error_description");
  return description
    ? decodeURIComponent(description.replace(/\+/g, " "))
    : "This password reset link is invalid or has expired.";
})();

export default function PasswordRecoveryGate({
  children,
  onSuccessPath = "/",
}: PasswordRecoveryGateProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<
    "normal" | "recover" | "updating" | "done" | "expired"
  >(() =>
    initialIsRecovery ? "recover" : initialUrlError ? "expired" : "normal",
  );
  const [err, setErr] = useState<string | null>(null);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("recover");
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (pw1.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (pw1 !== pw2) {
      setErr("Passwords do not match.");
      return;
    }
    setMode("updating");
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    if (error) {
      setMode("recover");
      setErr(error.message || "Failed to update password.");
      return;
    }
    setMode("done");
    setTimeout(() => navigate(onSuccessPath), 800);
  };

  const onResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendLoading(true);
    setResendMessage(null);
    try {
      await requestPasswordReset(resendEmail);
      setResendMessage(
        "Password reset email sent! Check your inbox for the new link.",
      );
    } catch (error) {
      setResendMessage(
        error instanceof Error
          ? error.message
          : "Couldn't send reset email. Please try again.",
      );
    } finally {
      setResendLoading(false);
    }
  };

  if (
    mode !== "recover" &&
    mode !== "updating" &&
    mode !== "done" &&
    mode !== "expired"
  ) {
    return <>{children}</>;
  }

  if (mode === "done") {
    return (
      <div className="max-w-md mx-auto p-6">
        <h1 className="text-xl font-semibold mb-2">Password updated</h1>
        <p className="text-sm text-gray-600">Redirecting…</p>
      </div>
    );
  }

  if (mode === "expired") {
    return (
      <div className="max-w-md mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Link expired</h1>
        <p className="text-sm text-gray-600 mb-4">
          {(initialUrlError ?? "This password reset link is invalid or has expired.").replace(
            /[.\s]*$/,
            "",
          )}
          . Enter your email below and we'll send you a new one.
        </p>
        <form onSubmit={onResend} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              className="w-full border rounded-md px-3 py-2"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          {resendMessage && (
            <p className="text-sm text-gray-700">{resendMessage}</p>
          )}
          <button
            type="submit"
            disabled={resendLoading}
            className="w-full rounded-md px-3 py-2 border font-semibold disabled:opacity-60"
          >
            {resendLoading ? "Sending…" : "Send new reset link"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Reset your password</h1>
      <p className="text-sm text-gray-600 mb-4">
        Enter a new password for your account.
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">
            New password
          </label>
          <input
            type="password"
            className="w-full border rounded-md px-3 py-2"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Confirm password
          </label>
          <input
            type="password"
            className="w-full border rounded-md px-3 py-2"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          type="submit"
          disabled={mode === "updating"}
          className="w-full rounded-md px-3 py-2 border font-semibold disabled:opacity-60"
        >
          {mode === "updating" ? "Saving…" : "Save new password"}
        </button>
      </form>
    </div>
  );
}
