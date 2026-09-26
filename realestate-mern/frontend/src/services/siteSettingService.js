import api from '../utils/axios';

// ------------------------------------------------------------------
// Site settings service — office contact/location + public social links.
// Singleton resource, editable by admins through the admin portal.
// GET is public (footer, social rail, office map); PUT is admin-only.
// ------------------------------------------------------------------

/**
 * Public site contact/location/social details. Auto-seeded server-side on
 * first read, so this never 404s in practice.
 * GET /api/site-settings
 * response: { success, settings: { office: { address, phone, email, lat, lng },
 *   socials: { facebook, tiktok, instagram, youtube, whatsapp } } }
 */
export const getSiteSettings = async () => {
  const { data } = await api.get('/site-settings');
  return data;
};

/**
 * Update site contact/location/social details (admin only).
 * PUT /api/site-settings
 * payload: { office: { address?, phone?, email?, lat?, lng? },
 *   socials: { facebook?, tiktok?, instagram?, youtube?, whatsapp? } }
 * response: { success, message, settings }
 */
export const updateSiteSettings = async (payload) => {
  const { data } = await api.put('/site-settings', payload);
  return data;
};
