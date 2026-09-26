import { useEffect, useState } from 'react';
import { getSiteSettings } from '../services/siteSettingService';

// Fallback = the values previously hardcoded in Footer/FloatingSocials, so
// the footer, office map and social rail render identically before the API
// responds (or if it is unreachable). Server seeds the same values.
const FALLBACK = {
  office: {
    address: 'Itahari Ward No. 6, Itahari, Koshi Province',
    phone: '+977 982-6031844',
    email: 'youthrealestate6@gmail.com',
    lat: 26.6637,
    lng: 87.2779,
  },
  socials: {
    facebook: 'https://www.facebook.com/share/1Er4dykkTo/',
    tiktok: 'https://www.tiktok.com/@youth_real_estate_5?_r=1&_t=ZS-99gxZruylGi',
    instagram: '',
    youtube: '',
    whatsapp: '',
  },
};

// Module-level cache: fetched once per page load, shared by Footer +
// FloatingSocials without adding another context provider.
let cached = null;
let inflight = null;

const load = () => {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = getSiteSettings()
      .then((data) => {
        cached = data?.settings || FALLBACK;
        return cached;
      })
      .catch(() => FALLBACK)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
};

export const invalidateSiteSettings = () => {
  cached = null;
};

/**
 * Site contact/location/social details with hardcoded fallback.
 * Returns { settings, loading } - settings is never null.
 */
export const useSiteSettings = () => {
  const [settings, setSettings] = useState(cached || FALLBACK);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    load().then((next) => {
      if (!cancelled) {
        setSettings(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, loading };
};

export const SITE_SETTINGS_FALLBACK = FALLBACK;
