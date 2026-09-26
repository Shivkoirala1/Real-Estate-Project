import React, { useEffect, useState } from 'react';
import { getSiteSettings, updateSiteSettings } from '../../services/siteSettingService';
import { invalidateSiteSettings } from '../../hooks/useSiteSettings';
import { useToast } from '../../context/ToastContext';

const SOCIAL_FIELDS = [
  { key: 'facebook', label: 'Facebook URL' },
  { key: 'tiktok', label: 'TikTok URL' },
  { key: 'instagram', label: 'Instagram URL' },
  { key: 'youtube', label: 'YouTube URL' },
  { key: 'whatsapp', label: 'WhatsApp URL' },
];

const emptyForm = () => ({
  address: '',
  phone: '',
  email: '',
  lat: '',
  lng: '',
  facebook: '',
  tiktok: '',
  instagram: '',
  youtube: '',
  whatsapp: '',
});

// Admin-editable site contact/location + public social links (display-only:
// footer contact column, office map pin, footer socials + floating rail.
// Empty social URL hides that icon everywhere).
const SiteSettings = () => {
  const { showToast } = useToast();
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSiteSettings()
      .then((data) => {
        if (cancelled) return;
        const s = data.settings || {};
        setForm({
          address: s.office?.address || '',
          phone: s.office?.phone || '',
          email: s.office?.email || '',
          lat: s.office?.lat ?? '',
          lng: s.office?.lng ?? '',
          facebook: s.socials?.facebook || '',
          tiktok: s.socials?.tiktok || '',
          instagram: s.socials?.instagram || '',
          youtube: s.socials?.youtube || '',
          whatsapp: s.socials?.whatsapp || '',
        });
      })
      .catch((err) => showToast(err.response?.data?.message || 'Failed to load site settings', 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        office: {
          address: form.address.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          lat: form.lat === '' ? null : Number(form.lat),
          lng: form.lng === '' ? null : Number(form.lng),
        },
        socials: {
          facebook: form.facebook.trim(),
          tiktok: form.tiktok.trim(),
          instagram: form.instagram.trim(),
          youtube: form.youtube.trim(),
          whatsapp: form.whatsapp.trim(),
        },
      };
      await updateSiteSettings(payload);
      invalidateSiteSettings();
      showToast('Site settings updated - footer, map and social links refreshed');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save site settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-slate-muted">Loading site settings...</p>;

  return (
    <div>
      <p className="eyebrow mb-2">Admin</p>
      <h1 className="text-3xl mb-2">Site Settings</h1>
      <p className="text-sm text-slate-muted mb-8">
        Office contact, map location and social links shown across the public site.
        Empty social URLs hide that icon everywhere.
      </p>

      <div className="bg-white border border-navy/10 rounded-sm p-6 shadow-card max-w-2xl mb-6">
        <h2 className="font-display text-lg text-navy mb-4">Office contact</h2>
        <label className="label-field" htmlFor="office-address">Address</label>
        <input id="office-address" className="input-field mb-4" value={form.address} onChange={set('address')} placeholder="Street, ward, city, province" />
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label-field" htmlFor="office-phone">Phone</label>
            <input id="office-phone" className="input-field" value={form.phone} onChange={set('phone')} placeholder="+977 98XXXXXXXX" />
          </div>
          <div>
            <label className="label-field" htmlFor="office-email">Email</label>
            <input id="office-email" type="email" className="input-field" value={form.email} onChange={set('email')} placeholder="office@example.com" />
          </div>
        </div>
      </div>

      <div className="bg-white border border-navy/10 rounded-sm p-6 shadow-card max-w-2xl mb-6">
        <h2 className="font-display text-lg text-navy mb-4">Office map location</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label-field" htmlFor="office-lat">Latitude (-90…90)</label>
            <input id="office-lat" type="number" step="any" className="input-field" value={form.lat} onChange={set('lat')} placeholder="26.6637" />
          </div>
          <div>
            <label className="label-field" htmlFor="office-lng">Longitude (-180…180)</label>
            <input id="office-lng" type="number" step="any" className="input-field" value={form.lng} onChange={set('lng')} placeholder="87.2779" />
          </div>
        </div>
        <p className="text-xs text-slate-muted mt-2">Drives the footer "Visit Us" map pin. Clearing both hides the map.</p>
      </div>

      <div className="bg-white border border-navy/10 rounded-sm p-6 shadow-card max-w-2xl mb-6">
        <h2 className="font-display text-lg text-navy mb-4">Social links</h2>
        {SOCIAL_FIELDS.map(({ key, label }) => (
          <div key={key} className="mb-4 last:mb-0">
            <label className="label-field" htmlFor={`social-${key}`}>{label}</label>
            <input
              id={`social-${key}`}
              className="input-field"
              value={form[key]}
              onChange={set(key)}
              placeholder="https://... (empty hides the icon)"
              inputMode="url"
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="btn-gold text-sm px-6 py-2.5 disabled:opacity-60"
      >
        {saving ? 'Saving...' : 'Save settings'}
      </button>
    </div>
  );
};

export default SiteSettings;
