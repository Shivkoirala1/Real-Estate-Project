import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getPropertyTypes } from '../services/categoryService';
import { NEPAL_PROVINCES, getDistrictsByProvince } from '../utils/nepalGeography';
import {useAuth} from "../context/AuthContext";

export const SALE_TYPE_OPTIONS = [
  { value: '', label: 'All Listings' },
  { value: 'sale', label: 'For Sale' },
  { value: 'rent', label: 'For Rent' },
];

// Default status list for the public-facing (select) usage. Management
// pages pass their own `statusOptions` (different value set, button style).
export const STATUS_OPTIONS = [
  { value: '', label: 'Any Status' },
  // { value: 'active', label: 'Active' },
  // { value: 'pending', label: 'Pending' },
  { value: 'sold', label: 'Sold' },
  { value: 'rented', label: 'Rented' },
];

// Every field the bar knows how to render. Consumers opt into whichever
// subset they need via the `filters` prop instead of the bar always
// rendering every possible field.
//
// Geography follows the canonical Province -> District -> Municipality
// hierarchy (see utils/nepalGeography.js). `city` was removed: it is no
// longer a canonical location field (legacy alias only, still accepted by
// the API for old bookmarked URLs but not offered as a filter).
export const FILTER_KEYS = [
  'saleType',
  'propertyType',
  'province',
  'district',
  'municipality',
  'minPrice',
  'maxPrice',
  'bedrooms',
  'bathrooms',
  'status',
  'sort',
];

// Fields shown inline in the primary row (alongside keyword + Search button)
// when rendered as a <select>.
const PRIMARY_FILTERS = ['propertyType', 'province', 'district'];
// Fields tucked behind the "More filters" toggle.
const ADVANCED_FILTERS = ['municipality', 'minPrice', 'maxPrice', 'bedrooms', 'bathrooms'];

const emptyForm = (searchParams) =>
  FILTER_KEYS.concat('keyword').reduce((acc, key) => {
    acc[key] = searchParams.get(key) || '';
    return acc;
  }, {});

const blankForm = () =>
  FILTER_KEYS.concat('keyword').reduce((acc, key) => {
    acc[key] = '';
    return acc;
  }, {});

/**
 * SearchFilterBar
 *
 * Two modes:
 *  - "route" (default): owns its own state, applies filters by navigating
 *    to /properties?... — used by the public listing page.
 *  - "controlled": fully driven by the parent via `values` + `onChange`,
 *    no navigation — used by admin/agent management screens that keep
 *    filters in local state and refetch on change.
 *
 * @param {boolean} compact - visual variant (drop the hero overlap styling).
 * @param {boolean} bare - skip the white card wrapper entirely, for
 *   embedding inline in a page section that already has its own chrome.
 * @param {boolean} showKeyword - whether to render the free-text keyword input.
 * @param {'primary'|'toolbar'} keywordPlacement - 'primary' sits next to the
 *   Search button; 'toolbar' sits in the instant-apply row (no submit needed).
 * @param {string} keywordPlaceholder
 * @param {string[]} filters - which of FILTER_KEYS to render. Defaults to all.
 * @param {'route'|'controlled'} mode
 * @param {object} values - current filter values, used when mode="controlled".
 * @param {(key: string, value: any) => void} onChange - fired on every field
 *   change when mode="controlled".
 * @param {() => void} onReset - fired by "Clear all filters" when mode="controlled".
 * @param {{value:any,label:string}[]} statusOptions
 * @param {'select'|'buttons'} statusVariant
 * @param {{value:any,label:string}[]} sortOptions
 * @param {'select'|'buttons'} sortVariant
 * @param {boolean} showSubmitButton - defaults to true in "route" mode, false in "controlled".
 * @param {string} className - extra classes appended to the wrapper.
 */
const SearchFilterBar = ({
  compact = false,
  bare = false,
  showKeyword = true,
  keywordPlacement = 'primary',
  keywordPlaceholder = 'Search by keyword, title...',
  filters = FILTER_KEYS,
  mode = 'route',
  values = {},
  onChange,
  onReset,
  statusOptions = STATUS_OPTIONS,
  statusVariant = 'select',
  sortOptions = [],
  sortVariant = 'select',
  showSubmitButton = mode === 'route',
  className = '',
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [showMore, setShowMore] = useState(false);
  const [form, setForm] = useState(() => emptyForm(searchParams));

  const isControlled = mode === 'controlled';
  const hasFilter = (key) => filters.includes(key);

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isClient = user?.role === "user";
  const isAgent = user?.role === "agent";


  // Keep the internal form in sync with the URL in "route" mode only; in
  // "controlled" mode the parent is the single source of truth.
  useEffect(() => {
    if (isControlled) return;
    setForm(emptyForm(searchParams));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString(), mode]);

  useEffect(() => {
    if (hasFilter('propertyType')) {
      getPropertyTypes().then((data) => setPropertyTypes(data.propertyTypes));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getValue = (key) => (isControlled ? values[key] ?? '' : form[key] ?? '');

  // Province scopes the district list, so changing it invalidates the
  // current district selection. Municipality is free-text and unaffected.
  const districtOptions = getDistrictsByProvince(getValue('province'));

  const setValue = (key, val) => {
    if (isControlled) {
      onChange && onChange(key, val);
      if (key === 'province') onChange && onChange('district', '');
      return;
    }
    if (key === 'province') {
      // Changing province invalidates any district from another province.
      setForm({ ...form, province: val, district: '' });
    } else {
      setForm({ ...form, [key]: val });
    }
  };

  const handleChange = (e) => setValue(e.target.name, e.target.value);

  const navigateWith = (nextForm) => {
    const params = new URLSearchParams();
    Object.entries(nextForm).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    navigate(`/properties?${params.toString()}`);
  };

  // Sale/Rent (and any button-style toggle) applies immediately instead of
  // waiting on the "Search" button, the same way tabs would.
  const handleSaleTypeChange = (value) => {
    if (isControlled) {
      setValue('saleType', value);
      return;
    }
    const nextForm = { ...form, saleType: value };
    setForm(nextForm);
    navigateWith(nextForm);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isControlled) navigateWith(form);
  };

  const handleReset = () => {
    if (isControlled) {
      onReset && onReset();
      return;
    }
    setForm(blankForm());
    navigate('/properties');
  };

  const fieldClass = 'input-field w-full md:w-auto md:flex-1 md:min-w-[150px]';

  const renderField = (key) => {
    switch (key) {
      case 'propertyType':
        return (
          <select key={key} name="propertyType" value={getValue('propertyType')} onChange={handleChange} className={fieldClass}>
            <option value="">All Types</option>
            {propertyTypes.map((t) => (
              <option key={t._id} value={t._id}>{t.name}</option>
            ))}
          </select>
        );
      case 'province':
        return (
          <select key={key} name="province" value={getValue('province')} onChange={handleChange} className={fieldClass}>
            <option value="">All Provinces</option>
            {NEPAL_PROVINCES.map((p) => (
              <option key={p.number} value={p.name}>{p.name}</option>
            ))}
          </select>
        );
      case 'district':
        return (
          <select key={key} name="district" value={getValue('district')} onChange={handleChange} className={fieldClass}>
            <option value="">All Districts</option>
            {districtOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        );
      case 'municipality':
        return (
          <input
            key={key}
            type="text" name="municipality" value={getValue('municipality')} onChange={handleChange}
            placeholder="Municipality" className={fieldClass}
          />
        );
      case 'minPrice':
        return (
          <input
            key={key}
            type="number" min="0" name="minPrice" value={getValue('minPrice')} onChange={handleChange}
            placeholder="Min price" className={fieldClass}
          />
        );
      case 'maxPrice':
        return (
          <input
            key={key}
            type="number" min="0" name="maxPrice" value={getValue('maxPrice')} onChange={handleChange}
            placeholder="Max price" className={fieldClass}
          />
        );
      case 'bedrooms':
        return (
          <select key={key} name="bedrooms" value={getValue('bedrooms')} onChange={handleChange} className={fieldClass}>
            <option value="">Any Beds</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}+ Beds</option>
            ))}
          </select>
        );
      case 'bathrooms':
        return (
          <select key={key} name="bathrooms" value={getValue('bathrooms')} onChange={handleChange} className={fieldClass}>
            <option value="">Any Baths</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}+ Baths</option>
            ))}
          </select>
        );
      case 'status':
        return (
          <select key={key} name="status" value={getValue('status')} onChange={handleChange} className={fieldClass}>
            {statusOptions.map((opt) => (
              <option key={String(opt.value)} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );
      case 'sort':
        return (
          <select key={key} name="sort" value={getValue('sort')} onChange={handleChange} className={fieldClass}>
            {sortOptions.map((opt) => (
              <option key={String(opt.value)} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );
      default:
        return null;
    }
  };

  // Pill-button group used for instant-apply toggles (status/sort in
  // "buttons" variant), styled to match the admin/agent management screens.
  const renderPillGroup = (key, options) => {
    const current = getValue(key);
    return (
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = String(current) === String(opt.value);
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => setValue(key, opt.value)}
              className={`text-sm px-3 py-1.5 rounded-sm border capitalize transition-colors ${
                active
                  ? 'border-brass text-brass bg-brass/5'
                  : 'border-navy/10 text-slate-muted hover:border-navy/20'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  };

  const keywordField = (
    <input
      name="keyword"
      value={getValue('keyword')}
      onChange={handleChange}
      placeholder={keywordPlaceholder}
      className={keywordPlacement === 'primary' ? 'input-field w-full md:flex-[2] md:min-w-[220px]' : 'input-field max-w-sm'}
    />
  );

  const statusIsButtons = hasFilter('status') && statusVariant === 'buttons';
  const sortIsButtons = hasFilter('sort') && sortVariant === 'buttons';

  const hasToolbarRow = (keywordPlacement === 'toolbar' && showKeyword) || statusIsButtons || sortIsButtons;

  const activePrimary = PRIMARY_FILTERS.filter(hasFilter);
  if (hasFilter('status') && statusVariant === 'select') activePrimary.push('status');
  if (hasFilter('sort') && sortVariant === 'select') activePrimary.push('sort');
  const activeAdvanced = ADVANCED_FILTERS.filter(hasFilter);

  const showPrimaryRow = (keywordPlacement === 'primary' && showKeyword) || activePrimary.length > 0 || showSubmitButton;

  const wrapperClass = bare
    ? className
    : `bg-white rounded-sm shadow-lifted p-5 ${compact ? '' : '-mt-12 relative z-20 mx-auto max-w-5xl'} ${className}`;

  return (
    <form onSubmit={handleSubmit} className={wrapperClass}>
      {hasFilter('saleType') && (
        <div className="flex flex-wrap gap-2 mb-4">
          {SALE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value || 'all'}
              type="button"
              onClick={() => handleSaleTypeChange(opt.value)}
              className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${
                getValue('saleType') === opt.value
                  ? 'bg-navy text-ivory'
                  : 'bg-parchment text-slate-ink hover:bg-parchment/70 border border-navy/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {hasToolbarRow && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          {keywordPlacement === 'toolbar' && showKeyword && keywordField}
          {statusIsButtons && renderPillGroup('status', statusOptions)}
          {}
          {sortIsButtons && (
            <div className="sm:ml-auto flex gap-2">
              {renderPillGroup('sort', sortOptions)}
            </div>
          )}
        </div>
      )}

      {showPrimaryRow && (
        <div className="flex flex-wrap gap-3">
          {keywordPlacement === 'primary' && showKeyword && keywordField}
          {activePrimary.map(renderField)}
          {showSubmitButton && <button type="submit" className="btn-gold">Search</button>}
        </div>
      )}

      {activeAdvanced.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowMore((s) => !s)}
            className="text-xs text-brass hover:underline mt-3"
          >
            {showMore ? 'Fewer filters −' : 'More filters +'}
          </button>

          {showMore && (
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-navy/10">
              {activeAdvanced.map(renderField)}
              <button type="button" onClick={handleReset} className="btn-secondary text-sm">Clear all filters</button>
            </div>
          )}
        </>
      )}
    </form>
  );
};

export default SearchFilterBar;