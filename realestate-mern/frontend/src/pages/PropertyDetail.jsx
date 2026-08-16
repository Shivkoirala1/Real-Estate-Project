import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import ImageGallery from '../components/ImageGallery';
import MapView from '../components/MapView';
import PropertyCard from '../components/PropertyCard';
import { formatPrice, statusStyles } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10}$/;

const specRows = (property) => {
  const d = property.details || {};
  return [
    ['Land Area', d.landArea ? `${d.landArea} ${d.landAreaUnit || ''}` : '—'],
    ['Built-up Area', d.builtUpArea ? `${d.builtUpArea} sq. ft.` : '—'],
    ['Bedrooms', d.bedrooms || '—'],
    ['Bathrooms', d.bathrooms || '—'],
    ['Floors', d.floors || '—'],
    ['Parking Spaces', d.parkingSpaces || '—'],
    ['Facing Direction', d.facingDirection || '—'],
    ['Road Access', d.roadAccess || '—'],
    ['Mukh (Road Frontage)', d.roadFrontage ? `${d.roadFrontage} ${d.roadFrontageUnit || 'ft'}` : '—'],
    ['Furnished Status', d.furnishedStatus || '—'],
    ['Construction Year', d.constructionYear || '—'],
    ['Water Supply', d.waterSupply ? 'Yes' : 'No'],
    ['Electricity', d.electricity ? 'Yes' : 'No'],
    ['Internet', d.internetAvailability ? 'Yes' : 'No'],
  ];
};

const PropertyDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [property, setProperty] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '', message: '' });
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        name: f.name || user.name || '',
        email: f.email || user.email || '',
        phone: f.phone || user.phone || '',
      }));
    }
  }, [user]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      setLoadError('');
      try {
        const { data } = await api.get(`/properties/${id}`);
        setProperty(data.property);
        setSimilar(data.similarProperties);
      } catch (err) {
        setProperty(null);
        // Distinguish "this property genuinely doesn't exist" (404) from a
        // real server/network error - showing "not found" for every kind of
        // failure was hiding real bugs behind a generic message.
        if (err.response?.status === 404) {
          setNotFound(true);
        } else {
          setLoadError(err.response?.data?.message || 'Something went wrong loading this property. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };
    load();
    window.scrollTo(0, 0);
  }, [id]);

  const handleFavorite = async () => {
    if (!user) return showToast('Please sign in to save properties', 'error');
    try {
      await api.post(`/properties/${property._id}/favorite`);
      showToast('Saved to your favorites');
    } catch (err) {
      showToast('Something went wrong', 'error');
    }
  };

  const validateInquiry = () => {
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

  const handleFormChange = (field, value) => {
    setForm({ ...form, [field]: value });
    if (errors[field]) setErrors({ ...errors, [field]: undefined });
  };

  const handleInquiry = async (e) => {
    e.preventDefault();
    if (!validateInquiry()) return;

    const confirmed = await confirm({
      title: 'Send this inquiry?',
      message: `Do you want to send this message to the agent about "${property.title}"?`,
      confirmLabel: 'Yes, send it',
      cancelLabel: 'No, go back',
    });
    if (!confirmed) return;

    setSending(true);
    try {
      await api.post('/inquiries', {
        ...form,
        subject: `Inquiry about ${property.title}`,
        property: property._id,
      });
      showToast('Your inquiry has been sent to the agent');
      setForm({ name: '', email: '', phone: '', message: '' });
      setErrors({});
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to send inquiry', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    showToast('Link copied to clipboard');
  };

  if (loading) return <p className="text-center py-24 text-slate-muted">Loading property...</p>;

  if (notFound) return (
    <div className="text-center py-24">
      <p className="font-display text-2xl mb-3">Property not found</p>
      <p className="text-slate-muted text-sm mb-4">This listing may have been removed or the link is incorrect.</p>
      <Link to="/properties" className="text-brass hover:underline">Back to listings</Link>
    </div>
  );

  if (loadError) return (
    <div className="text-center py-24">
      <p className="font-display text-2xl mb-3 text-brick">Couldn't load this property</p>
      <p className="text-slate-muted text-sm mb-4">{loadError}</p>
      <Link to="/properties" className="text-brass hover:underline">Back to listings</Link>
    </div>
  );

  if (!property) return null;

  const status = statusStyles[property.status] || statusStyles.available;
  const lat = property.location?.mapLocation?.lat;
  const lng = property.location?.mapLocation?.lng;

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-10">
      <div className="flex items-center gap-2 text-sm text-slate-muted mb-6">
        <Link to="/" className="hover:text-brass">Home</Link> /
        <Link to="/properties" className="hover:text-brass">Properties</Link> /
        <span className="text-navy">{property.title}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2">
          <ImageGallery coverImage={property.media?.coverImage} images={property.media?.images} />

          <div className="flex items-start justify-between mt-8 mb-2">
            <div>
              <span className="status-badge text-white" style={{ backgroundColor: status.bg }}>{status.label}</span>
              <h1 className="text-3xl mt-3">{property.title}</h1>
              <p className="text-slate-muted mt-1">
                {property.location?.streetAddress ? `${property.location.streetAddress}, ` : ''}
                {property.location?.municipality ? `${property.location.municipality}, ` : ''}
                {property.location?.city?.name || ''}{property.location?.district?.name ? `, ${property.location.district.name}` : ''}
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={handleFavorite} className="btn-secondary text-sm px-3 py-2">♥ Save</button>
              <button onClick={handleShare} className="btn-secondary text-sm px-3 py-2">Share</button>
            </div>
          </div>

          <p className="text-2xl font-display text-brass mb-8">
            {formatPrice(property.price, property.currency)}
            {property.negotiable && <span className="text-sm text-slate-muted font-body ml-2">(Negotiable)</span>}
          </p>

          <h2 className="text-xl mb-3">Description</h2>
          <p className="text-slate-ink leading-relaxed mb-10 whitespace-pre-line">{property.description}</p>

          <h2 className="text-xl mb-4">Property Specifications</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 mb-10 border border-navy/10 rounded-sm p-6">
            {specRows(property).map(([label, value]) => (
              <div key={label}>
                <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">{label}</p>
                <p className="text-sm font-medium text-navy">{value}</p>
              </div>
            ))}
          </div>

          {property.media?.video && (
            <>
              <h2 className="text-xl mb-4">Video Tour</h2>
              <div className="mb-10">
                <a
                  href={property.media.video}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary inline-flex text-sm"
                >
                  Watch video tour ↗
                </a>
              </div>
            </>
          )}

          <h2 className="text-xl mb-4">Location</h2>
          <div className="mb-10">
            <p className="text-sm text-slate-ink mb-3">
              {[
                property.location?.streetAddress,
                property.location?.municipality,
                property.location?.wardNumber ? `Ward ${property.location.wardNumber}` : null,
                property.location?.city?.name,
                property.location?.district?.name,
                property.location?.province,
              ].filter(Boolean).join(', ') || 'Location details not provided'}
            </p>
            {(lat !== undefined && lat !== null && lat !== '') ? (
              <MapView lat={lat} lng={lng} title={property.title} />
            ) : (
              <div className="h-32 rounded-sm border border-dashed border-navy/20 bg-parchment/50 flex items-center justify-center text-sm text-slate-muted">
                The poster hasn't pinned an exact location on the map for this listing yet.
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: contact + agent */}
        <div>
          <div className="bg-white border border-navy/10 rounded-sm p-6 shadow-card sticky top-24">
            <p className="eyebrow mb-3">Listed by</p>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full bg-brass text-navy flex items-center justify-center font-display text-xl overflow-hidden flex-shrink-0">
                {property.listedBy?.selfiePhoto ? (
                  <img src={property.listedBy.selfiePhoto} alt={property.listedBy.name} className="w-full h-full object-cover" />
                ) : (
                  property.listedBy?.name?.charAt(0).toUpperCase() || 'A'
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="font-display text-lg text-navy leading-tight">{property.listedBy?.name || 'Ashland Estates'}</p>
                  {property.listedBy?.verificationStatus === 'verified' && (
                    <span title="Identity verified" className="text-sage text-sm">✓</span>
                  )}
                </div>
                {property.listedBy?.createdAt && (
                  <p className="text-xs text-slate-muted">
                    Member since {new Date(property.listedBy.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-parchment rounded-sm px-4 py-3 mb-6">
              <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Contact Number</p>
              {property.listedBy?.phone ? (
                <a href={`tel:${property.listedBy.phone}`} className="font-semibold text-navy hover:text-brass transition-colors">
                  {property.listedBy.phone}
                </a>
              ) : (
                <p className="text-sm text-slate-muted">Not provided — use the form below</p>
              )}
              {property.listedBy?.email && (
                <p className="text-sm text-slate-muted mt-1">{property.listedBy.email}</p>
              )}
            </div>

            <p className="font-semibold text-navy mb-3">Send an inquiry</p>
            {user && property.listedBy?._id === user._id ? (
              <div className="bg-parchment/60 border border-dashed border-navy/20 rounded-sm px-4 py-4 text-sm text-slate-muted">
                This is your own listing, so there's nothing to inquire about here. Manage it from{' '}
                <Link to="/my-properties" className="text-brass hover:underline font-medium">My Properties</Link>.
              </div>
            ) : (
              <form onSubmit={handleInquiry} noValidate className="space-y-3">
                <div>
                  <input
                    placeholder="Your name"
                    className={`input-field ${errors.name ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
                    value={form.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                  />
                  {errors.name && <p className="text-xs text-brick mt-1">{errors.name}</p>}
                </div>
                <div>
                  <input
                    type="email"
                    placeholder="Email address"
                    className={`input-field ${errors.email ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
                    value={form.email}
                    onChange={(e) => handleFormChange('email', e.target.value)}
                  />
                  {errors.email && <p className="text-xs text-brick mt-1">{errors.email}</p>}
                </div>
                <div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="Phone number (98XXXXXXXX)"
                    className={`input-field ${errors.phone ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
                    value={form.phone}
                    onChange={(e) => handleFormChange('phone', e.target.value.replace(/\D/g, ''))}
                  />
                  {errors.phone && <p className="text-xs text-brick mt-1">{errors.phone}</p>}
                </div>
                <div>
                  <textarea
                    rows={4}
                    placeholder="I'm interested in this property..."
                    className={`input-field ${errors.message ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
                    value={form.message}
                    onChange={(e) => handleFormChange('message', e.target.value)}
                  />
                  {errors.message && <p className="text-xs text-brick mt-1">{errors.message}</p>}
                </div>
                <button disabled={sending} type="submit" className="btn-primary w-full">
                  {sending ? 'Sending...' : 'Send Inquiry'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {similar.length > 0 && (
        <div className="mt-20">
          <h2 className="text-2xl mb-6">Similar Properties</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {similar.map((p) => <PropertyCard key={p._id} property={p} />)}
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertyDetail;
