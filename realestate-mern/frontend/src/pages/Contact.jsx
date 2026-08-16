import React, { useState } from 'react';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10}$/;

const Contact = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: 'General Inquiry', message: '' });
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

    const confirmed = await confirm({
      title: 'Send this message?',
      message: 'Do you want to send this message to Ashland Estates?',
      confirmLabel: 'Yes, send it',
      cancelLabel: 'No, go back',
    });
    if (!confirmed) return;

    setSending(true);
    try {
      await api.post('/inquiries', form);
      showToast('Message sent. We will get back to you soon.');
      setForm({ name: '', email: '', phone: '', subject: 'General Inquiry', message: '' });
      setErrors({});
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to send message', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-8 py-16 grid grid-cols-1 md:grid-cols-2 gap-14">
      <div>
        <p className="eyebrow mb-2">Get in touch</p>
        <h1 className="text-3xl mb-6">Contact Ashland Estates</h1>
        <p className="text-slate-muted leading-relaxed mb-8">
          Have a question about a listing, or want to sell your property with us? Send a message and our team will respond shortly.
        </p>
        <div className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Office Address</p>
            <p className="font-medium text-navy">123 Market Street, Biratnagar, Nepal</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Phone</p>
            <p className="font-medium text-navy">+977 1-4567890</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Email</p>
            <p className="font-medium text-navy">info@ashlandestates.com</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4 bg-white p-8 rounded-sm shadow-card border border-navy/10 h-fit">
        <div>
          <label className="label-field">Your name</label>
          <input
            className={`input-field ${errors.name ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
          />
          {errors.name && <p className="text-xs text-brick mt-1">{errors.name}</p>}
        </div>
        <div>
          <label className="label-field">Email address</label>
          <input
            type="email"
            placeholder="you@example.com"
            className={`input-field ${errors.email ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
            value={form.email}
            onChange={(e) => handleChange('email', e.target.value)}
          />
          {errors.email && <p className="text-xs text-brick mt-1">{errors.email}</p>}
        </div>
        <div>
          <label className="label-field">Phone number</label>
          <input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            placeholder="98XXXXXXXX"
            className={`input-field ${errors.phone ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
            value={form.phone}
            onChange={(e) => handleChange('phone', e.target.value.replace(/\D/g, ''))}
          />
          {errors.phone && <p className="text-xs text-brick mt-1">{errors.phone}</p>}
        </div>
        <div>
          <label className="label-field">Message</label>
          <textarea
            rows={5}
            className={`input-field ${errors.message ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
            value={form.message}
            onChange={(e) => handleChange('message', e.target.value)}
          />
          {errors.message && <p className="text-xs text-brick mt-1">{errors.message}</p>}
        </div>
        <button disabled={sending} type="submit" className="btn-primary w-full">
          {sending ? 'Sending...' : 'Send message'}
        </button>
      </form>
    </div>
  );
};

export default Contact;
