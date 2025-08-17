import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/config/supabase";

type PasswordRecoveryGateProps = {
  children: React.ReactNode;
  onSuccessPath?: string;
};

export default function PasswordRecoveryGate({
  children,
  onSuccessPath = "/",
}: PasswordRecoveryGateProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"normal" | "recover" | "updating" | "done">(
    "normal",
  );
  const [err, setErr] = useState<string | null>(null);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");

  const isUrlRecovery = useMemo(() => {
    try {
      const url = new URL(window.location.href);
      const qType = url.searchParams.get("type");
      const hashType = new URLSearchParams((url.hash || "").replace(/^#/, "")).get(
        "type",
      );
      return qType === "recovery" || hashType === "recovery";
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("recover");
    });
    if (isUrlRecovery) setMode("recover");
    return () => sub?.subscription?.unsubscribe?.();
  }, [isUrlRecovery]);

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

  if (mode !== "recover" && mode !== "updating" && mode !== "done") {
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

