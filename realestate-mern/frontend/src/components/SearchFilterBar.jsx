import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';

const SALE_TYPE_OPTIONS = [
  { value: '', label: 'All Listings' },
  { value: 'sale', label: 'For Sale' },
  { value: 'rent', label: 'For Rent' },
];

const emptyForm = (searchParams) => ({
  keyword: searchParams.get('keyword') || '',
  saleType: searchParams.get('saleType') || '',
  propertyType: searchParams.get('propertyType') || '',
  district: searchParams.get('district') || '',
  city: searchParams.get('city') || '',
  minPrice: searchParams.get('minPrice') || '',
  maxPrice: searchParams.get('maxPrice') || '',
  bedrooms: searchParams.get('bedrooms') || '',
  bathrooms: searchParams.get('bathrooms') || '',
});

const SearchFilterBar = ({ compact = false }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [cities, setCities] = useState([]);
  const [showMore, setShowMore] = useState(false);
  const [form, setForm] = useState(() => emptyForm(searchParams));

  // Keep the form fields in sync if the URL's filters change from elsewhere
  // (e.g. a "Browse by category" link on the homepage), so the bar doesn't
  // silently show stale selections that no longer match what's applied.
  useEffect(() => {
    setForm(emptyForm(searchParams));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  useEffect(() => {
    api.get('/categories/property-types').then((res) => setPropertyTypes(res.data.propertyTypes));
    api.get('/categories/districts').then((res) => setDistricts(res.data.districts));
  }, []);

  // Cities depend on the selected district
  useEffect(() => {
    if (form.district) {
      api.get(`/categories/cities?district=${form.district}`).then((res) => setCities(res.data.cities));
    } else {
      api.get('/categories/cities').then((res) => setCities(res.data.cities));
    }
  }, [form.district]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    // Changing district invalidates any previously selected city from a
    // different district.
    if (name === 'district') {
      setForm({ ...form, district: value, city: '' });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const navigateWith = (nextForm) => {
    const params = new URLSearchParams();
    Object.entries(nextForm).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    navigate(`/properties?${params.toString()}`);
  };

  // Sale/Rent are the two headline filters real estate visitors reach for
  // first, so switching between them applies immediately instead of waiting
  // on the "Search" button, the same way tabs would.
  const handleSaleTypeChange = (value) => {
    const nextForm = { ...form, saleType: value };
    setForm(nextForm);
    navigateWith(nextForm);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    navigateWith(form);
  };

  const handleReset = () => {
    setForm({
      keyword: '', saleType: '', propertyType: '', district: '', city: '',
      minPrice: '', maxPrice: '', bedrooms: '', bathrooms: '',
    });
    navigate('/properties');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`bg-white rounded-sm shadow-lifted p-5 ${compact ? '' : '-mt-12 relative z-20 mx-auto max-w-5xl'}`}
    >
      <div className="flex flex-wrap gap-2 mb-4">
        {SALE_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value || 'all'}
            type="button"
            onClick={() => handleSaleTypeChange(opt.value)}
            className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${
              form.saleType === opt.value
                ? 'bg-navy text-ivory'
                : 'bg-parchment text-slate-ink hover:bg-parchment/70 border border-navy/10'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <input
          name="keyword"
          value={form.keyword}
          onChange={handleChange}
          placeholder="Search by keyword, title..."
          className="input-field md:col-span-2"
        />
        <select name="propertyType" value={form.propertyType} onChange={handleChange} className="input-field">
          <option value="">All Types</option>
          {propertyTypes.map((t) => (
            <option key={t._id} value={t._id}>{t.name}</option>
          ))}
        </select>
        <select name="district" value={form.district} onChange={handleChange} className="input-field">
          <option value="">All Districts</option>
          {districts.map((d) => (
            <option key={d._id} value={d._id}>{d.name}</option>
          ))}
        </select>
        <select name="city" value={form.city} onChange={handleChange} className="input-field">
          <option value="">All Cities</option>
          {cities.map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </select>
        <button type="submit" className="btn-gold">Search</button>
      </div>

      <button
        type="button"
        onClick={() => setShowMore((s) => !s)}
        className="text-xs text-brass hover:underline mt-3"
      >
        {showMore ? 'Fewer filters −' : 'More filters (price, beds, baths) +'}
      </button>

      {showMore && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 pt-3 border-t border-navy/10">
          <input
            type="number" min="0" name="minPrice" value={form.minPrice} onChange={handleChange}
            placeholder="Min price" className="input-field"
          />
          <input
            type="number" min="0" name="maxPrice" value={form.maxPrice} onChange={handleChange}
            placeholder="Max price" className="input-field"
          />
          <select name="bedrooms" value={form.bedrooms} onChange={handleChange} className="input-field">
            <option value="">Any Beds</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}+ Beds</option>
            ))}
          </select>
          <select name="bathrooms" value={form.bathrooms} onChange={handleChange} className="input-field">
            <option value="">Any Baths</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}+ Baths</option>
            ))}
          </select>
          <button type="button" onClick={handleReset} className="btn-secondary text-sm">Clear all filters</button>
        </div>
      )}
    </form>
  );
};

export default SearchFilterBar;
