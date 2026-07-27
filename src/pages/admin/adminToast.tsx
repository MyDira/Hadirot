import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

type ToastTone = 'success' | 'error';

interface ToastState {
  message: string;
  tone: ToastTone;
}

const AdminToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {});

export function useAdminToast() {
  return useContext(AdminToastContext);
}

export function AdminToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    setToast({ message, tone });
  }, []);

  return (
    <AdminToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div
          className={`fixed top-32 right-4 z-50 rounded-md px-4 py-2 text-sm font-medium text-white shadow-lg ${
            toast.tone === 'error' ? 'bg-red-600' : 'bg-green-600'
          }`}
        >
          {toast.message}
        </div>
      )}
    </AdminToastContext.Provider>
  );
}
