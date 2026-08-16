import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import MapPicker from '../../components/MapPicker';
import MultiImageUpload from '../../components/MultiImageUpload';
import LandUnitConverter from '../../components/LandUnitConverter';
import { SQFT_PER_UNIT } from '../../utils/landUnits';
import { NEPAL_PROVINCES } from '../../utils/nepalProvinces';

// Land area unit choices for the dropdown - the two traditional Nepali
// systems plus standard units. Values match the keys landUnits.js knows how
// to convert, so "Dhur" / "Aana" etc. posted here plug straight into the
// converter.
const LAND_AREA_UNITS = [
  { value: 'sq. ft.', label: 'Sq. Feet' },
  { value: 'sq. m.', label: 'Sq. Meters' },
  { value: 'ropani', label: 'Ropani' },
  { value: 'aana', label: 'Aana' },
  { value: 'paisa', label: 'Paisa' },
  { value: 'daam', label: 'Daam' },
  { value: 'bigha', label: 'Bigha' },
  { value: 'kattha', label: 'Kattha' },
  { value: 'dhur', label: 'Dhur' },
];

// Map a landAreaUnit display string to the landUnits.js conversion key, for
// the live "≈" hint shown under the Land Area field. Matches the lowercase
// unit strings already used across seeded/existing property data.
const UNIT_KEY_BY_LABEL = {
  'sq. ft.': 'sqft',
  'sq. m.': 'sqm',
  ropani: 'ropani',
  aana: 'aana',
  paisa: 'paisa',
  daam: 'daam',
  bigha: 'bigha',
  kattha: 'kattha',
  dhur: 'dhur',
};

const CURRENT_YEAR = new Date().getFullYear();

const initialState = {
  title: '',
  description: '',
  propertyType: '',
  saleType: 'sale',
  price: '',
  currency: 'NPR',
  negotiable: false,
  location: {
    province: '',
    district: '',
    city: '',
    municipality: '',
    wardNumber: '',
    streetAddress: '',
    mapLocation: { lat: '', lng: '' },
  },
  details: {
    landArea: '',
    landAreaUnit: 'sq. ft.',
    kittaNumber: '',
    landType: '',
    builtUpArea: '',
    bedrooms: '',
    bathrooms: '',
    floors: '',
    parkingSpaces: '',
    facingDirection: '',
    roadAccess: '',
    roadFrontage: '',
    roadFrontageUnit: 'ft',
    waterSupply: false,
    electricity: false,
    internetAvailability: false,
    furnishedStatus: 'unfurnished',
    constructionYear: '',
  },
  video: '',
};

const errorInputClass = (hasError) => (hasError ? 'border-brick focus:border-brick focus:ring-brick' : '');

const AddEditProperty = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [form, setForm] = useState(initialState);
  // Which of the two posting forms is active. Driven by the selected
  // Property Type's category ('land' vs 'building') - Land gets the
  // practical land-only form, everything else (House, Apartment, Villa,
  // Commercial Space, Traditional Nepali Home) gets the building form.
  const [category, setCategory] = useState('building');
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [cities, setCities] = useState([]);
  const [coverImage, setCoverImage] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [currentCoverImage, setCurrentCoverImage] = useState(''); // existing cover when editing
  const [images, setImages] = useState([]); // newly added File objects
  const [existingImages, setExistingImages] = useState([]); // kept existing image URLs
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [showConverter, setShowConverter] = useState(false);
  const [addingCity, setAddingCity] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [addCityError, setAddCityError] = useState('');
  const [savingCity, setSavingCity] = useState(false);

  useEffect(() => {
    api.get('/categories/property-types').then((res) => setPropertyTypes(res.data.propertyTypes));
    api.get('/categories/districts').then((res) => setDistricts(res.data.districts));
  }, []);

  useEffect(() => {
    if (form.location.district) {
      api.get(`/categories/cities?district=${form.location.district}`).then((res) => setCities(res.data.cities));
    } else {
      setCities([]);
    }
  }, [form.location.district]);

  useEffect(() => {
    if (isEdit) {
      api.get(`/properties/${id}`).then((res) => {
        const p = res.data.property;
        setForm({
          title: p.title,
          description: p.description,
          propertyType: p.propertyType?._id || p.propertyType,
          saleType: p.saleType,
          price: p.price,
          currency: 'NPR',
          negotiable: p.negotiable,
          location: {
            province: p.location?.province || '',
            district: p.location?.district?._id || p.location?.district || '',
            city: p.location?.city?._id || p.location?.city || '',
            municipality: p.location?.municipality || '',
            wardNumber: p.location?.wardNumber || '',
            streetAddress: p.location?.streetAddress || '',
            mapLocation: {
              lat: p.location?.mapLocation?.lat ?? '',
              lng: p.location?.mapLocation?.lng ?? '',
            },
          },
          details: {
            ...initialState.details,
            ...p.details,
          },
          video: p.media?.video || '',
        });
        setExistingImages(p.media?.images || []);
        setCurrentCoverImage(p.media?.coverImage || '');
        if (p.propertyType?.category) setCategory(p.propertyType.category);
      });
    }
  }, [id, isEdit]);

  const updateField = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const updateLocation = (field, value) => setForm((f) => ({ ...f, location: { ...f.location, [field]: value } }));
  const updateDetails = (field, value) => setForm((f) => ({ ...f, details: { ...f.details, [field]: value } }));

  // Clears a single field's error as soon as the user edits it, so the
  // message doesn't linger after they've already fixed the problem.
  const clearFieldError = (field) => {
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // Switching between the Land form and the House/Apartment form clears
  // out the fields that only make sense for the other one (and the
  // Property Type selection, if it no longer matches), so a leftover
  // bedroom count from an abandoned house draft can't sneak into a land
  // listing or vice versa.
  const handleCategoryChange = (nextCategory) => {
    if (nextCategory === category) return;
    setCategory(nextCategory);
    setFieldErrors({});
    setForm((f) => {
      const stillValidType = propertyTypes.find((t) => t._id === f.propertyType)?.category === nextCategory;
      return {
        ...f,
        propertyType: stillValidType ? f.propertyType : '',
        details: {
          ...initialState.details,
          landArea: f.details.landArea,
          landAreaUnit: f.details.landAreaUnit,
        },
      };
    });
  };

  const handleMapPick = (lat, lng) => {
    setForm((f) => ({ ...f, location: { ...f.location, mapLocation: { lat, lng } } }));
    clearFieldError('mapLocation');
  };

  // Province -> District -> City are a strict cascade using only the
  // official Nepal dataset seeded on the backend - no free-text entry - so
  // a listing can't end up with a made-up location.
  const handleProvinceSelect = (value) => {
    setForm((f) => ({ ...f, location: { ...f.location, province: value, district: '', city: '' } }));
    clearFieldError('district');
  };

  const handleDistrictSelect = (value) => {
    // Changing district invalidates any previously selected city from a
    // different district.
    setForm((f) => ({ ...f, location: { ...f.location, district: value, city: '' } }));
    setAddingCity(false);
    setNewCityName('');
    setAddCityError('');
  };

  const districtsInProvince = form.location.province
    ? districts.filter((d) => d.province === form.location.province)
    : districts;

  const handleAddCity = async () => {
    const name = newCityName.trim();
    if (!name) {
      setAddCityError('Please enter a city / town name');
      return;
    }
    if (!form.location.district) {
      setAddCityError('Select a district first');
      return;
    }
    setSavingCity(true);
    setAddCityError('');
    try {
      const { data } = await api.post('/categories/cities/find-or-create', {
        name,
        district: form.location.district,
      });
      setCities((prev) => {
        if (prev.some((c) => c._id === data.city._id)) return prev;
        return [...prev, data.city].sort((a, b) => a.name.localeCompare(b.name));
      });
      updateLocation('city', data.city._id);
      clearFieldError('city');
      setNewCityName('');
      setAddingCity(false);
      showToast(data.created ? `"${data.city.name}" added — it'll be available for everyone from now on` : `"${data.city.name}" already existed, selected it`);
    } catch (err) {
      setAddCityError(err.response?.data?.message || 'Failed to add city');
    } finally {
      setSavingCity(false);
    }
  };

  const handleCoverChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Only photo files are allowed for the cover image', 'error');
      e.target.value = '';
      return;
    }
    setCoverImage(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const removeExistingImage = (index) => {
    setExistingImages((imgs) => imgs.filter((_, i) => i !== index));
  };

  // Practical, real-world validation for a property listing - beyond "is it
  // filled in", these check that the numbers make sense, and what's
  // required differs by category: a Land listing has no bedrooms to
  // validate, and a House/Apartment listing needs more than just an area.
  const validateForm = () => {
    const next = {};
    const isLand = category === 'land';

    if (!form.title.trim()) {
      next.title = 'Title is required';
    } else if (form.title.trim().length < 10) {
      next.title = 'Title should be at least 10 characters so buyers know what they’re looking at';
    } else if (form.title.trim().length > 120) {
      next.title = 'Title is too long - keep it under 120 characters';
    }

    if (!form.description.trim()) {
      next.description = 'Description is required';
    } else if (form.description.trim().length < 30) {
      next.description = 'Description should be at least 30 characters - give buyers something to go on';
    }

    if (!form.propertyType) next.propertyType = 'Select a property type';

    if (form.price === '' || form.price === null) {
      next.price = 'Price is required';
    } else if (Number(form.price) <= 0) {
      next.price = 'Price must be greater than 0';
    } else if (Number(form.price) > 100_000_000_000) {
      next.price = 'That price looks too high - please double-check it';
    }

    if (!form.location.province) next.province = 'Select a province';
    if (!form.location.district) next.district = 'Select a district';
    if (!form.location.city) next.city = 'Select the main place / city';

    if (!form.location.mapLocation?.lat || !form.location.mapLocation?.lng) {
      next.mapLocation = 'Pin the property\'s location on the map (or use "Use my current location")';
    }

    if (form.details.landArea === '' || form.details.landArea === null) {
      next.landArea = 'Land area is required';
    } else if (Number(form.details.landArea) <= 0) {
      next.landArea = 'Land area must be greater than 0';
    }

    if (form.details.roadFrontage !== '' && Number(form.details.roadFrontage) < 0) {
      next.roadFrontage = 'Road frontage cannot be negative';
    }

    if (isLand) {
      // Land form has no further required fields beyond area + location -
      // kitta number, land type, mukh, road access etc. are all useful
      // detail but optional, since not every plot has all of them on record.
    } else {
      if (form.details.builtUpArea === '' || form.details.builtUpArea === null) {
        next.builtUpArea = 'Built-up area is required';
      } else if (Number(form.details.builtUpArea) <= 0) {
        next.builtUpArea = 'Built-up area must be greater than 0';
      }

      if (form.details.bedrooms === '' || form.details.bedrooms === null) {
        next.bedrooms = 'Number of bedrooms is required';
      } else if (Number(form.details.bedrooms) < 0 || !Number.isInteger(Number(form.details.bedrooms)) || Number(form.details.bedrooms) > 50) {
        next.bedrooms = 'Enter a whole number between 0 and 50';
      }

      if (form.details.bathrooms === '' || form.details.bathrooms === null) {
        next.bathrooms = 'Number of bathrooms is required';
      } else if (Number(form.details.bathrooms) < 0 || !Number.isInteger(Number(form.details.bathrooms)) || Number(form.details.bathrooms) > 50) {
        next.bathrooms = 'Enter a whole number between 0 and 50';
      }

      if (form.details.floors === '' || form.details.floors === null) {
        next.floors = 'Number of floors is required';
      } else if (Number(form.details.floors) < 1 || !Number.isInteger(Number(form.details.floors)) || Number(form.details.floors) > 100) {
        next.floors = 'Enter a whole number of floors, at least 1';
      }

      if (form.details.parkingSpaces !== '' && (Number(form.details.parkingSpaces) < 0 || !Number.isInteger(Number(form.details.parkingSpaces)) || Number(form.details.parkingSpaces) > 50)) {
        next.parkingSpaces = 'Enter a whole number between 0 and 50';
      }

      if (form.details.constructionYear !== '') {
        const year = Number(form.details.constructionYear);
        if (!Number.isInteger(year) || year < 1900 || year > CURRENT_YEAR) {
          next.constructionYear = `Enter a year between 1900 and ${CURRENT_YEAR}`;
        }
      }
    }

    if (!coverImage && !currentCoverImage) {
      next.coverImage = 'Please add a cover image for this property';
    }

    return next;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError('Please fix the highlighted fields below before submitting.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setFieldErrors({});

    const confirmed = await confirm({
      title: isEdit ? 'Save these changes?' : 'Post this property?',
      message: isEdit
        ? 'Do you want to save the changes to this listing? Buyers browsing the site will see the updated details right away.'
        : 'Do you want to submit this property listing? It will go live on the site once submitted.',
      confirmLabel: isEdit ? 'Yes, save changes' : 'Yes, post it',
      cancelLabel: 'No, go back',
    });
    if (!confirmed) return;

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('description', form.description);
      fd.append('propertyType', form.propertyType);
      fd.append('saleType', form.saleType);
      fd.append('price', form.price);
      fd.append('currency', 'NPR');
      fd.append('negotiable', form.negotiable);
      fd.append('video', form.video);

      // Omit district/city entirely when unselected (an empty string would
      // otherwise crash the save with an invalid-ObjectId error server-side).
      const location = { ...form.location };
      if (!location.district) delete location.district;
      if (!location.city) delete location.city;
      if (!location.mapLocation?.lat || !location.mapLocation?.lng) delete location.mapLocation;
      fd.append('location', JSON.stringify(location));
      fd.append('details', JSON.stringify(form.details));
      fd.append('existingImages', JSON.stringify(existingImages));

      if (coverImage) fd.append('coverImage', coverImage);
      images.forEach((img) => fd.append('images', img));

      if (isEdit) {
        await api.put(`/properties/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        showToast('Property updated successfully');
      } else {
        await api.post('/properties', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        showToast('Property added successfully');
      }
      navigate(user?.role === 'admin' ? '/dashboard/admin/properties' : '/my-properties');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save property');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const visiblePropertyTypes = propertyTypes.filter((t) => (t.category || 'building') === category);

  return (
    <div>
      <p className="eyebrow mb-2">{isEdit ? 'Edit Listing' : 'New Listing'}</p>
      <h1 className="text-3xl mb-8">{isEdit ? 'Edit Property' : 'Add New Property'}</h1>

      {error && <div className="bg-brick-light text-brick text-sm px-4 py-3 rounded-sm mb-6">{error}</div>}

      {/* Which posting form: Land is a genuinely different listing from a
          House/Apartment/etc., so this decides which fields appear below. */}
      <div className="bg-white border border-navy/10 rounded-sm p-6 mb-10">
        <h2 className="text-lg font-semibold text-navy mb-1">What are you listing?</h2>
        <p className="text-sm text-slate-muted mb-4">This decides which details we'll ask for below.</p>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <button
            type="button"
            onClick={() => handleCategoryChange('building')}
            className={`px-4 py-3 rounded-sm border text-sm font-medium text-left transition-colors ${
              category === 'building' ? 'border-brass bg-brass-light/20 text-navy' : 'border-navy/15 text-slate-ink hover:border-navy/30'
            }`}
          >
            House / Apartment
            <span className="block text-xs font-normal text-slate-muted mt-0.5">Villa, commercial space & more</span>
          </button>
          <button
            type="button"
            onClick={() => handleCategoryChange('land')}
            className={`px-4 py-3 rounded-sm border text-sm font-medium text-left transition-colors ${
              category === 'land' ? 'border-brass bg-brass-light/20 text-navy' : 'border-navy/15 text-slate-ink hover:border-navy/30'
            }`}
          >
            Bare Land / Plot
            <span className="block text-xs font-normal text-slate-muted mt-0.5">Residential, commercial or agricultural</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-10">
        {/* Basic Information */}
        <section className="bg-white border border-navy/10 rounded-sm p-6">
          <h2 className="text-lg font-semibold text-navy mb-5">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label-field">Property Title</label>
              <input
                required
                className={`input-field ${errorInputClass(fieldErrors.title)}`}
                value={form.title}
                onChange={(e) => { updateField('title', e.target.value); clearFieldError('title'); }}
              />
              {fieldErrors.title && <p className="text-xs text-brick mt-1">{fieldErrors.title}</p>}
            </div>
            <div className="md:col-span-2">
              <label className="label-field">Description</label>
              <textarea
                required
                rows={4}
                className={`input-field ${errorInputClass(fieldErrors.description)}`}
                value={form.description}
                onChange={(e) => { updateField('description', e.target.value); clearFieldError('description'); }}
              />
              {fieldErrors.description && <p className="text-xs text-brick mt-1">{fieldErrors.description}</p>}
            </div>
            <div>
              <label className="label-field">Property Type</label>
              <select
                required
                className={`input-field ${errorInputClass(fieldErrors.propertyType)}`}
                value={form.propertyType}
                onChange={(e) => { updateField('propertyType', e.target.value); clearFieldError('propertyType'); }}
              >
                <option value="">Select type</option>
                {visiblePropertyTypes.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
              {fieldErrors.propertyType && <p className="text-xs text-brick mt-1">{fieldErrors.propertyType}</p>}
            </div>
            <div>
              <label className="label-field">Sale Type</label>
              <select className="input-field" value={form.saleType} onChange={(e) => updateField('saleType', e.target.value)}>
                <option value="sale">For Sale</option>
                <option value="rent">For Rent</option>
              </select>
            </div>
            <div>
              <label className="label-field">Price</label>
              <input
                required
                type="number"
                min="0"
                className={`input-field ${errorInputClass(fieldErrors.price)}`}
                value={form.price}
                onChange={(e) => { updateField('price', e.target.value); clearFieldError('price'); }}
              />
              {fieldErrors.price && <p className="text-xs text-brick mt-1">{fieldErrors.price}</p>}
            </div>
            <div>
              <label className="label-field">Currency</label>
              <div className="input-field bg-parchment/60 text-slate-ink flex items-center justify-between cursor-not-allowed">
                <span>NPR — Nepalese Rupee</span>
                <span className="text-xs text-slate-muted">Fixed</span>
              </div>
              <p className="text-xs text-slate-muted mt-1">All listings on Ashland Estates are priced in Nepalese Rupees.</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input type="checkbox" id="negotiable" checked={form.negotiable} onChange={(e) => updateField('negotiable', e.target.checked)} />
              <label htmlFor="negotiable" className="text-sm text-slate-ink">Price is negotiable</label>
            </div>
          </div>
        </section>

        {/* Location */}
        <section className="bg-white border border-navy/10 rounded-sm p-6">
          <h2 className="text-lg font-semibold text-navy mb-5">Location</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="label-field">Province <span className="text-brick">*</span></label>
              <select
                className={`input-field ${errorInputClass(fieldErrors.province)}`}
                value={form.location.province}
                onChange={(e) => { handleProvinceSelect(e.target.value); clearFieldError('province'); }}
              >
                <option value="">Select province</option>
                {NEPAL_PROVINCES.map((p) => (
                  <option key={p.number} value={p.name}>Province {p.number} — {p.name}</option>
                ))}
              </select>
              {fieldErrors.province && <p className="text-xs text-brick mt-1">{fieldErrors.province}</p>}
            </div>
            <div>
              <label className="label-field">District <span className="text-brick">*</span></label>
              <select
                className={`input-field ${errorInputClass(fieldErrors.district)}`}
                value={form.location.district}
                onChange={(e) => { handleDistrictSelect(e.target.value); clearFieldError('district'); }}
                disabled={!form.location.province}
              >
                <option value="">{form.location.province ? 'Select district' : 'Select a province first'}</option>
                {districtsInProvince.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
              {fieldErrors.district && <p className="text-xs text-brick mt-1">{fieldErrors.district}</p>}
            </div>
            <div>
              <label className="label-field">City / Main Place <span className="text-brick">*</span></label>
              {!addingCity ? (
                <>
                  <select
                    className={`input-field ${errorInputClass(fieldErrors.city)}`}
                    value={form.location.city}
                    onChange={(e) => {
                      if (e.target.value === '__add_new__') {
                        setAddingCity(true);
                        setAddCityError('');
                        return;
                      }
                      updateLocation('city', e.target.value);
                      clearFieldError('city');
                    }}
                    disabled={!form.location.district}
                  >
                    <option value="">{form.location.district ? 'Select city / main place' : 'Select a district first'}</option>
                    {cities.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                    {form.location.district && <option value="__add_new__">+ Add a new city / town...</option>}
                  </select>
                  {fieldErrors.city && <p className="text-xs text-brick mt-1">{fieldErrors.city}</p>}
                </>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      className={`input-field ${addCityError ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
                      placeholder="e.g. Dharampur"
                      value={newCityName}
                      onChange={(e) => { setNewCityName(e.target.value); setAddCityError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCity(); } }}
                    />
                    <button
                      type="button"
                      onClick={handleAddCity}
                      disabled={savingCity}
                      className="btn-gold text-sm px-4 whitespace-nowrap"
                    >
                      {savingCity ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setAddingCity(false); setNewCityName(''); setAddCityError(''); }}
                    className="text-xs text-slate-muted hover:underline"
                  >
                    ← Back to city list
                  </button>
                  {addCityError && <p className="text-xs text-brick">{addCityError}</p>}
                  <p className="text-xs text-slate-muted">
                    This will be saved permanently — everyone posting a property in this district will be able to select it afterward.
                  </p>
                </div>
              )}
            </div>
            <div>
              <label className="label-field">Municipality / Ward Locality</label>
              <input className="input-field" value={form.location.municipality} onChange={(e) => updateLocation('municipality', e.target.value)} placeholder="e.g. Kathmandu Metropolitan City" />
            </div>
            <div>
              <label className="label-field">Ward Number</label>
              <input className="input-field" value={form.location.wardNumber} onChange={(e) => updateLocation('wardNumber', e.target.value)} />
            </div>
            <div>
              <label className="label-field">Tole Name</label>
              <input className="input-field" value={form.location.streetAddress} onChange={(e) => updateLocation('streetAddress', e.target.value)} placeholder="e.g. Bishnu Marga Tole" />
            </div>
          </div>

          <label className="label-field">Pin the property on the map <span className="text-brick">*</span></label>
          <MapPicker
            lat={form.location.mapLocation.lat}
            lng={form.location.mapLocation.lng}
            onChange={handleMapPick}
          />
          {fieldErrors.mapLocation && <p className="text-xs text-brick mt-2">{fieldErrors.mapLocation}</p>}
        </section>

        {/* Property Details - genuinely different fields depending on category */}
        <section className="bg-white border border-navy/10 rounded-sm p-6">
          <h2 className="text-lg font-semibold text-navy mb-5">
            {category === 'land' ? 'Land Details' : 'Property Details'}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="label-field">Land Area <span className="text-brick">*</span></label>
              <input
                type="number"
                className={`input-field ${errorInputClass(fieldErrors.landArea)}`}
                value={form.details.landArea}
                onChange={(e) => { updateDetails('landArea', e.target.value); clearFieldError('landArea'); }}
              />
              {fieldErrors.landArea && <p className="text-xs text-brick mt-1">{fieldErrors.landArea}</p>}
              {!fieldErrors.landArea && form.details.landArea && UNIT_KEY_BY_LABEL[form.details.landAreaUnit] && UNIT_KEY_BY_LABEL[form.details.landAreaUnit] !== 'sqft' && (
                <p className="text-xs text-slate-muted mt-1">
                  ≈ {(Number(form.details.landArea) * (SQFT_PER_UNIT[UNIT_KEY_BY_LABEL[form.details.landAreaUnit]] || 0)).toLocaleString('en-US', { maximumFractionDigits: 1 })} sq. ft.
                </p>
              )}
            </div>
            <div>
              <label className="label-field">Land Area Unit</label>
              <select className="input-field" value={form.details.landAreaUnit} onChange={(e) => updateDetails('landAreaUnit', e.target.value)}>
                {LAND_AREA_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setShowConverter((v) => !v)}
                className="text-xs text-brass hover:underline mt-1"
              >
                {showConverter ? 'Hide unit converter' : 'Need to convert units? Open converter'}
              </button>
            </div>

            {category === 'land' ? (
              <>
                <div>
                  <label className="label-field">Kitta Number (Plot No.)</label>
                  <input className="input-field" placeholder="e.g. 142" value={form.details.kittaNumber} onChange={(e) => updateDetails('kittaNumber', e.target.value)} />
                </div>
                <div>
                  <label className="label-field">Land Type</label>
                  <select className="input-field" value={form.details.landType} onChange={(e) => updateDetails('landType', e.target.value)}>
                    <option value="">Not specified</option>
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial</option>
                    <option value="agricultural">Agricultural</option>
                    <option value="industrial">Industrial</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="label-field">Built-up Area (sq. ft.) <span className="text-brick">*</span></label>
                  <input
                    type="number"
                    className={`input-field ${errorInputClass(fieldErrors.builtUpArea)}`}
                    value={form.details.builtUpArea}
                    onChange={(e) => { updateDetails('builtUpArea', e.target.value); clearFieldError('builtUpArea'); }}
                  />
                  {fieldErrors.builtUpArea && <p className="text-xs text-brick mt-1">{fieldErrors.builtUpArea}</p>}
                </div>
                <div>
                  <label className="label-field">Construction Year</label>
                  <input
                    type="number"
                    className={`input-field ${errorInputClass(fieldErrors.constructionYear)}`}
                    value={form.details.constructionYear}
                    onChange={(e) => { updateDetails('constructionYear', e.target.value); clearFieldError('constructionYear'); }}
                  />
                  {fieldErrors.constructionYear && <p className="text-xs text-brick mt-1">{fieldErrors.constructionYear}</p>}
                </div>
              </>
            )}

            {category !== 'land' && (
              <>
                <div>
                  <label className="label-field">Bedrooms <span className="text-brick">*</span></label>
                  <input
                    type="number"
                    className={`input-field ${errorInputClass(fieldErrors.bedrooms)}`}
                    value={form.details.bedrooms}
                    onChange={(e) => { updateDetails('bedrooms', e.target.value); clearFieldError('bedrooms'); }}
                  />
                  {fieldErrors.bedrooms && <p className="text-xs text-brick mt-1">{fieldErrors.bedrooms}</p>}
                </div>
                <div>
                  <label className="label-field">Bathrooms <span className="text-brick">*</span></label>
                  <input
                    type="number"
                    className={`input-field ${errorInputClass(fieldErrors.bathrooms)}`}
                    value={form.details.bathrooms}
                    onChange={(e) => { updateDetails('bathrooms', e.target.value); clearFieldError('bathrooms'); }}
                  />
                  {fieldErrors.bathrooms && <p className="text-xs text-brick mt-1">{fieldErrors.bathrooms}</p>}
                </div>
                <div>
                  <label className="label-field">Floors <span className="text-brick">*</span></label>
                  <input
                    type="number"
                    className={`input-field ${errorInputClass(fieldErrors.floors)}`}
                    value={form.details.floors}
                    onChange={(e) => { updateDetails('floors', e.target.value); clearFieldError('floors'); }}
                  />
                  {fieldErrors.floors && <p className="text-xs text-brick mt-1">{fieldErrors.floors}</p>}
                </div>
                <div>
                  <label className="label-field">Parking Spaces</label>
                  <input
                    type="number"
                    className={`input-field ${errorInputClass(fieldErrors.parkingSpaces)}`}
                    value={form.details.parkingSpaces}
                    onChange={(e) => { updateDetails('parkingSpaces', e.target.value); clearFieldError('parkingSpaces'); }}
                  />
                  {fieldErrors.parkingSpaces && <p className="text-xs text-brick mt-1">{fieldErrors.parkingSpaces}</p>}
                </div>
                <div>
                  <label className="label-field">Furnished Status</label>
                  <select className="input-field" value={form.details.furnishedStatus} onChange={(e) => updateDetails('furnishedStatus', e.target.value)}>
                    <option value="unfurnished">Unfurnished</option>
                    <option value="semi-furnished">Semi-furnished</option>
                    <option value="fully-furnished">Fully-furnished</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="label-field">Facing Direction</label>
              <input className="input-field" value={form.details.facingDirection} onChange={(e) => updateDetails('facingDirection', e.target.value)} />
            </div>
            <div>
              <label className="label-field">Road Access</label>
              <input className="input-field" value={form.details.roadAccess} onChange={(e) => updateDetails('roadAccess', e.target.value)} placeholder="e.g. 13 ft blacktopped" />
            </div>
            <div>
              <label className="label-field">Mukh (Road Frontage)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  className={`input-field ${errorInputClass(fieldErrors.roadFrontage)}`}
                  placeholder="e.g. 20"
                  value={form.details.roadFrontage}
                  onChange={(e) => { updateDetails('roadFrontage', e.target.value); clearFieldError('roadFrontage'); }}
                />
                <select
                  className="input-field w-20 flex-shrink-0"
                  value={form.details.roadFrontageUnit}
                  onChange={(e) => updateDetails('roadFrontageUnit', e.target.value)}
                >
                  <option value="ft">ft</option>
                  <option value="m">m</option>
                </select>
              </div>
              {fieldErrors.roadFrontage ? (
                <p className="text-xs text-brick mt-1">{fieldErrors.roadFrontage}</p>
              ) : (
                <p className="text-xs text-slate-muted mt-1">The width of the land facing the road.</p>
              )}
            </div>

            <div className="flex flex-col justify-end gap-2 pb-2">
              <label className="flex items-center gap-2 text-sm text-slate-ink">
                <input type="checkbox" checked={form.details.waterSupply} onChange={(e) => updateDetails('waterSupply', e.target.checked)} /> Water Supply
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-ink">
                <input type="checkbox" checked={form.details.electricity} onChange={(e) => updateDetails('electricity', e.target.checked)} /> Electricity
              </label>
              {category !== 'land' && (
                <label className="flex items-center gap-2 text-sm text-slate-ink">
                  <input type="checkbox" checked={form.details.internetAvailability} onChange={(e) => updateDetails('internetAvailability', e.target.checked)} /> Internet
                </label>
              )}
            </div>
          </div>

          {showConverter && (
            <div className="mt-6 border-t border-navy/10 pt-6">
              <LandUnitConverter compact initialUnit={UNIT_KEY_BY_LABEL[form.details.landAreaUnit] || 'dhur'} initialValue={form.details.landArea || '1'} />
            </div>
          )}
        </section>

        {/* Media */}
        <section className="bg-white border border-navy/10 rounded-sm p-6 space-y-6">
          <h2 className="text-lg font-semibold text-navy">Photos</h2>

          <div>
            <label className="label-field">Cover Photo {!isEdit && <span className="text-brick">*</span>}</label>
            {(coverPreview || currentCoverImage) && (
              <img
                src={coverPreview || currentCoverImage}
                alt="Cover preview"
                className="w-40 h-28 object-cover rounded-sm border border-navy/15 mb-2"
              />
            )}
            <input
              type="file"
              accept="image/*"
              className={`input-field ${errorInputClass(fieldErrors.coverImage)}`}
              onChange={(e) => { handleCoverChange(e); clearFieldError('coverImage'); }}
            />
            {fieldErrors.coverImage ? (
              <p className="text-xs text-brick mt-1">{fieldErrors.coverImage}</p>
            ) : (
              <p className="text-xs text-slate-muted mt-1">This is the main photo shown on listing cards. Photos only - no videos.</p>
            )}
          </div>

          <MultiImageUpload
            label="Additional Photos"
            files={images}
            onFilesChange={setImages}
            existingImages={existingImages}
            onRemoveExisting={removeExistingImage}
          />

          <div>
            <label className="label-field">Video Link (optional)</label>
            <input className="input-field" placeholder="https://youtube.com/... or other video link" value={form.video} onChange={(e) => updateField('video', e.target.value)} />
            <p className="text-xs text-slate-muted mt-1">Paste a link to a video hosted elsewhere (e.g. YouTube) - video files can't be uploaded directly, only photos.</p>
          </div>
        </section>

        <button disabled={saving} type="submit" className="btn-primary px-8">
          {saving ? 'Saving...' : isEdit ? 'Update Property' : 'Add Property'}
        </button>
      </form>
    </div>
  );
};

export default AddEditProperty;
