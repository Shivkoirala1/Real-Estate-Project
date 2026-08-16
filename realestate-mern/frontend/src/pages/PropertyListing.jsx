import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import SearchFilterBar from '../components/SearchFilterBar';
import PropertyCard from '../components/PropertyCard';

const PropertyListing = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [properties, setProperties] = useState([]);
  const [meta, setMeta] = useState({ total: 0, pages: 1, page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const sort = searchParams.get('sort') || '';

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get(`/properties?${searchParams.toString()}`);
        setProperties(data.properties);
        setMeta({ total: data.total, pages: data.pages, page: data.page });
      } catch (err) {
        setProperties([]);
        setError(err.response?.data?.message || 'Failed to load properties. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [searchParams]);

  const handleSortChange = (e) => {
    const params = new URLSearchParams(searchParams);
    params.set('sort', e.target.value);
    params.set('page', '1');
    setSearchParams(params);
  };

  const goToPage = (page) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', page);
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-12">
      <p className="eyebrow mb-2">Listings</p>
      <h1 className="text-3xl mb-8">All Properties</h1>

      <SearchFilterBar compact />

      <div className="flex items-center justify-between mt-8 mb-6">
        <p className="text-sm text-slate-muted">{meta.total} propert{meta.total === 1 ? 'y' : 'ies'} found</p>
        <select value={sort} onChange={handleSortChange} className="input-field w-48">
          <option value="">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="price_low">Price: Low to High</option>
          <option value="price_high">Price: High to Low</option>
        </select>
      </div>

      {loading ? (
        <p className="text-slate-muted py-16 text-center">Loading properties...</p>
      ) : error ? (
        <div className="py-16 text-center border border-dashed border-brick/30 rounded-sm bg-brick-light">
          <p className="font-display text-xl mb-2 text-brick">Something went wrong</p>
          <p className="text-brick text-sm">{error}</p>
        </div>
      ) : properties.length === 0 ? (
        <div className="py-24 text-center border border-dashed border-navy/20 rounded-sm">
          <p className="font-display text-xl mb-2">No properties match your search</p>
          <p className="text-slate-muted text-sm">Try adjusting your filters or search keyword.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {properties.map((p) => <PropertyCard key={p._id} property={p} />)}
          </div>

          {meta.pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-12">
              {Array.from({ length: meta.pages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  className={`w-9 h-9 rounded-sm text-sm font-medium transition-colors ${
                    meta.page === page ? 'bg-navy text-ivory' : 'bg-white text-navy border border-navy/15 hover:border-brass'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PropertyListing;
