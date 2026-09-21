import React, { useState } from 'react';
import { createContactForm } from '../../services/contactFormService';
import { isValidRequiredNote, requiredNoteMessage } from '../../utils/validateNotes';
import { getCooldownRemainingMs, markCooldown, cooldownMessageFor } from '../../utils/inquiryCooldown';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10}$/;

const emptyForm = { name: '', email: '', phone: '', subject: 'General Inquiry', message: '' };

// The one contact form (previously the /contact page body). Validation,
// confirm step, submission, and success/error handling are unchanged —
// `onSubmitted` lets a host (e.g. the modal) react to success.
const ContactForm = ({ onSubmitted }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Please enter your name';
    if (!form.email.trim()) next.email = 'Please enter your email address';
    else if (!EMAIL_REGEX.test(form.email.trim())) next.email = 'Please enter a valid email address';
    if (!form.phone.trim()) next.phone = 'Please enter your phone number';
    else if (!PHONE_REGEX.test(form.phone.trim())) next.phone = 'Phone number must be exactly 10 digits';
    if (!form.message.trim()) next.message = 'Please enter a message';
    else if (!isValidRequiredNote(form.message)) next.message = requiredNoteMessage('Message');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleChange = (field, value) => {
    setForm({ ...form, [field]: value });
    if (errors[field]) setErrors({ ...errors, [field]: undefined });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const remaining = getCooldownRemainingMs('general');
    if (remaining > 0) {
      showToast(cooldownMessageFor('general', remaining), 'error');
      return;
    }

    const confirmed = await confirm({
      title: 'Send this message?',
      message: 'Do you want to send this message to Youth Real Estate?',
      confirmLabel: 'Yes, send it',
      cancelLabel: 'No, go back',
    });
    if (!confirmed) return;

    setSending(true);
    try {
      const result = await createContactForm(form);
      markCooldown('general');
      showToast(
        result?.message || 'Message sent. Our team has been notified and will get back to you soon.'
      );
      setForm(emptyForm);
      setErrors({});
      onSubmitted?.();
    } catch (err) {
      if (err.response?.status === 429) markCooldown('general');
      showToast(err.response?.data?.message || 'Failed to send message', 'error');
    } finally {
      setSending(false);
    }
  };

  const errorClass = (hasError) => (hasError ? 'border-brick focus:border-brick focus:ring-brick' : '');

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor="contact-name" className="label-field">Your name</label>
        <input
          id="contact-name"
          autoComplete="name"
          className={`input-field ${errorClass(errors.name)}`}
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          aria-invalid={!!errors.name}
        />
        {errors.name && <p className="text-xs text-brick mt-1" role="alert">{errors.name}</p>}
      </div>
      <div>
        <label htmlFor="contact-email" className="label-field">Email address</label>
        <input
          id="contact-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          className={`input-field ${errorClass(errors.email)}`}
          value={form.email}
          onChange={(e) => handleChange('email', e.target.value)}
          aria-invalid={!!errors.email}
        />
        {errors.email && <p className="text-xs text-brick mt-1" role="alert">{errors.email}</p>}
      </div>
      <div>
        <label htmlFor="contact-phone" className="label-field">Phone number</label>
        <input
          id="contact-phone"
          type="tel"
          autoComplete="tel"
          inputMode="numeric"
          maxLength={10}
          placeholder="98XXXXXXXX"
          className={`input-field ${errorClass(errors.phone)}`}
          value={form.phone}
          onChange={(e) => handleChange('phone', e.target.value.replace(/\D/g, ''))}
          aria-invalid={!!errors.phone}
        />
        {errors.phone && <p className="text-xs text-brick mt-1" role="alert">{errors.phone}</p>}
      </div>
      <div>
        <label htmlFor="contact-message" className="label-field">Message</label>
        <textarea
          id="contact-message"
          rows={5}
          className={`input-field ${errorClass(errors.message)}`}
          value={form.message}
          onChange={(e) => handleChange('message', e.target.value)}
          aria-invalid={!!errors.message}
        />
        {errors.message && <p className="text-xs text-brick mt-1" role="alert">{errors.message}</p>}
      </div>
      <button disabled={sending} type="submit" className="btn-primary w-full disabled:opacity-50">
        {sending ? 'Sending...' : 'Send message'}
      </button>
    </form>
  );
};

export default ContactForm;
