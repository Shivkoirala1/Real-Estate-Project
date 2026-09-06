import api from '../utils/axios';

// ------------------------------------------------------------------
// Contact form service - public submissions + admin inbox.
// ------------------------------------------------------------------

/**
 * Submit the public contact form.
 * POST /api/contact-forms (public, optional auth)
 * payload: { name, email, phone, subject, message, property? }
 */
export const createContactForm = async (formData) => {
  const { data } = await api.post('/contact-forms', formData);
  return data; // { success, message, contactForm }
};

/**
 * Admin inbox listing.
 * GET /api/contact-forms?status=&page=&limit=
 */
export const getContactForms = async (params = {}) => {
  const { data } = await api.get('/contact-forms', { params });
  return data; // { success, contactForms, pagination }
};

/**
 * Forms the current user has sent.
 * GET /api/contact-forms/sent
 */
export const getSentContactForms = async (params = {}) => {
  const { data } = await api.get('/contact-forms/sent', { params });
  return data; // { success, contactForms, pagination }
};

/**
 * Single contact form.
 * GET /api/contact-forms/:id
 */
export const getContactFormById = async (id) => {
  const { data } = await api.get(`/contact-forms/${id}`);
  return data; // { success, contactForm }
};

/**
 * Admin reply to a submission.
 * PATCH /api/contact-forms/:id/respond { response }
 */
export const respondToContactForm = async (id, response) => {
  const { data } = await api.patch(`/contact-forms/${id}/respond`, { response });
  return data; // { success, message, contactForm }
};

/**
 * Update inbox status (new | read | responded | converted).
 * PATCH /api/contact-forms/:id/status { status }
 */
export const updateContactFormStatus = async (id, status) => {
  const { data } = await api.patch(`/contact-forms/${id}/status`, { status });
  return data;
};

/**
 * Delete a submission (admin only).
 * DELETE /api/contact-forms/:id
 */
export const deleteContactForm = async (id) => {
  const { data } = await api.delete(`/contact-forms/${id}`);
  return data; // { success, message }
};

// Conversion lives in leadService (convertContactFormToLead) - re-exported
// here for convenience so the inbox can import from either place.
export { convertContactFormToLead } from './leadService';
