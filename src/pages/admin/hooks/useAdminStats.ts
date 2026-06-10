import { useCallback, useEffect, useState } from 'react';
import { adminPanelService, AdminStats, LifecycleSettings } from '@/services/adminPanel';
import { useAdminToast } from '../adminToast';

export function useAdminStats() {
  const toast = useAdminToast();
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalListings: 0,
    featuredListings: 0,
    activeUsers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<LifecycleSettings | null>(null);
  const [rentalDays, setRentalDays] = useState(30);
  const [saleDays, setSaleDays] = useState(30);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [statsRes, settingsRes] = await Promise.all([
          adminPanelService.getStats(),
          adminPanelService.getLifecycleSettings(),
        ]);
        if (cancelled) return;
        setStats(statsRes);
        if (settingsRes) {
          setSettings(settingsRes);
          setRentalDays(settingsRes.rental_active_days);
          setSaleDays(settingsRes.sale_active_days);
        }
      } catch (error) {
        console.error('Error loading admin stats:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveLifecycle = useCallback(async () => {
    if (rentalDays < 7 || rentalDays > 365 || saleDays < 7 || saleDays > 365) {
      toast('Duration must be between 7 and 365 days', 'error');
      return;
    }
    if (!Number.isInteger(rentalDays) || !Number.isInteger(saleDays)) {
      toast('Duration must be a whole number', 'error');
      return;
    }
    if (!settings) {
      toast('Admin settings not found', 'error');
      return;
    }

    setSaving(true);
    try {
      await adminPanelService.saveLifecycleSettings(settings.id, rentalDays, saleDays);
      toast('Listing lifecycle settings saved');
    } catch (error) {
      console.error('Error saving listing lifecycle:', error);
      toast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }, [rentalDays, saleDays, settings, toast]);

  return {
    stats,
    loading,
    rentalDays,
    saleDays,
    setRentalDays,
    setSaleDays,
    saveLifecycle,
    saving,
  };
}
