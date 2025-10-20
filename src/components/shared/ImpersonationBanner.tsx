import React, { useState } from 'react';
import { AlertTriangle, LogOut, Clock } from 'lucide-react';
import { useImpersonation } from '@/hooks/useImpersonation';

export function ImpersonationBanner() {
  const {
    isImpersonating,
    impersonatedProfile,
    timeRemainingSeconds,
    endImpersonation,
    loading,
  } = useImpersonation();
  const [isEnding, setIsEnding] = useState(false);

  if (!isImpersonating || !impersonatedProfile) {
    return null;
  }

  const formatTime = (seconds: number | null): string => {
    if (seconds === null || seconds < 0) return '0:00:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleEndImpersonation = async () => {
    if (!confirm('Are you sure you want to exit impersonation mode?')) {
      return;
    }

    setIsEnding(true);
    try {
      await endImpersonation();
      window.location.href = '/admin?tab=users';
    } catch (err) {
      console.error('Failed to end impersonation:', err);
      alert('Failed to end impersonation. Please try again.');
    } finally {
      setIsEnding(false);
    }
  };

  const isLowTime = timeRemainingSeconds !== null && timeRemainingSeconds <= 300; // 5 minutes
  const isCriticalTime = timeRemainingSeconds !== null && timeRemainingSeconds <= 120; // 2 minutes

  const bannerClass = isCriticalTime
    ? 'bg-red-600'
    : isLowTime
    ? 'bg-orange-500'
    : 'bg-amber-500';

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 ${bannerClass} text-white shadow-lg transition-colors duration-300`}
      role="banner"
      aria-live="polite"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3 gap-4 flex-wrap md:flex-nowrap">
          {/* Left section - Warning and user info */}
          <div className="flex items-center gap-3 min-w-0">
            <AlertTriangle
              className={`w-6 h-6 flex-shrink-0 ${isCriticalTime ? 'animate-pulse' : ''}`}
              aria-hidden="true"
            />
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
              <span className="font-semibold text-sm sm:text-base whitespace-nowrap">
                Impersonating:
              </span>
              <span className="font-bold text-base sm:text-lg truncate">
                {impersonatedProfile.full_name}
              </span>
              <span className="text-xs sm:text-sm opacity-90 capitalize">
                ({impersonatedProfile.role})
              </span>
            </div>
          </div>

          {/* Center section - Timer */}
          <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg backdrop-blur-sm">
            <Clock className={`w-5 h-5 ${isCriticalTime ? 'animate-pulse' : ''}`} aria-hidden="true" />
            <span className="font-mono text-lg font-bold" aria-label="Time remaining">
              {formatTime(timeRemainingSeconds)}
            </span>
          </div>

          {/* Right section - Exit button */}
          <button
            onClick={handleEndImpersonation}
            disabled={isEnding || loading}
            className="flex items-center gap-2 bg-white text-gray-900 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-md"
            aria-label="Exit impersonation mode"
          >
            {isEnding ? (
              <>
                <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                <span>Exiting...</span>
              </>
            ) : (
              <>
                <LogOut className="w-5 h-5" aria-hidden="true" />
                <span>Exit Impersonation</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Warning message for low time */}
      {isLowTime && (
        <div className="bg-black/20 py-2 text-center text-sm font-medium">
          {isCriticalTime
            ? '⚠️ Session expiring soon! All changes are being saved.'
            : '⏰ Less than 5 minutes remaining in this session.'}
        </div>
      )}
    </div>
  );
}
