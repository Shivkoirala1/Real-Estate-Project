import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import SearchFilterBar from '../components/SearchFilterBar';
import PropertyCard from '../components/PropertyCard';

const Home = () => {
  const [featured, setFeatured] = useState([]);
  const [latest, setLatest] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setError('');
      try {
        // allSettled so one failing request (e.g. no featured properties yet)
        // doesn't wipe out the others, and a real failure is still reported
        // instead of silently rendering an empty page.
        const [featuredRes, latestRes, typesRes] = await Promise.allSettled([
          api.get('/properties?featured=true&limit=3'),
          api.get('/properties?limit=6'),
          api.get('/categories/property-types'),
        ]);

        if (featuredRes.status === 'fulfilled') setFeatured(featuredRes.value.data.properties);
        if (latestRes.status === 'fulfilled') setLatest(latestRes.value.data.properties);
        if (typesRes.status === 'fulfilled') setTypes(typesRes.value.data.propertyTypes);

        if (latestRes.status === 'rejected') {
          setError(latestRes.reason?.response?.data?.message || 'Failed to load properties.');
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Aerial photo of Kathmandu - free-to-use under the Unsplash License
            (Photo by Sujitabh Chaudhary). Swap this URL for your own hero
            photo any time; everything else adapts automatically. */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1587186846095-f8c531b4683c?auto=format&fit=crop&w=1920&q=80')",
          }}
        />
        {/* Layered gradient: solid enough over the text zone to stay fully
            legible, lighter toward the right so the photo still reads through. */}
        <div className="absolute inset-0 bg-gradient-to-r from-navy-dark via-navy-dark/90 md:via-navy-dark/80 to-navy-dark/45" />
        <div className="absolute inset-0 bg-navy-dark/20" />

        <div className="max-w-7xl mx-auto px-5 md:px-8 pt-20 pb-32 relative">
          <p className="eyebrow mb-4 hero-text-shadow">Ashland Estates — Nepal's Trusted Ghar-Jagga Marketplace</p>
          <h1 className="text-4xl md:text-6xl text-white leading-[1.05] max-w-3xl mb-6 hero-text-shadow">
            Find your dream <span className="italic text-brass-light">ghar</span> in the heart of Nepal.
          </h1>
          <p className="text-ivory/90 max-w-xl text-lg leading-relaxed hero-text-shadow">
            Ghar, jagga, apartments, and commercial spaces — browse verified listings across Kathmandu Valley, Pokhara, and beyond, or list your own property with our agent team.
          </p>
          <p className="text-brass-light max-w-xl text-sm italic mt-3 hero-text-shadow">
            घर, जग्गा र व्यावसायिक सम्पत्ति — विश्वसनीय बिक्रीका लागि एउटै ठेगाना।
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <SearchFilterBar />
      </div>

      {/* Property categories */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 mt-20">
        <p className="eyebrow mb-2">Categories</p>
        <h2 className="text-3xl mb-8">Browse by property type</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {types.map((t) => (
            <Link
              key={t._id}
              to={`/properties?propertyType=${t._id}`}
              className="border border-navy/10 rounded-sm p-5 text-center hover:border-brass hover:shadow-card transition-all"
            >
              <p className="font-display text-lg text-navy">{t.name}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured */}
      {featured.length > 0 && (
        <section className="max-w-7xl mx-auto px-5 md:px-8 mt-20">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="eyebrow mb-2">Handpicked</p>
              <h2 className="text-3xl">Featured properties</h2>
            </div>
            <Link to="/properties" className="text-sm font-medium text-brass hover:underline">View all →</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {featured.map((p) => <PropertyCard key={p._id} property={p} />)}
          </div>
        </section>
      )}

      {/* Latest */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 mt-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="eyebrow mb-2">Fresh on the market</p>
            <h2 className="text-3xl">Latest listings</h2>
          </div>
          <Link to="/properties?sort=newest" className="text-sm font-medium text-brass hover:underline">View all →</Link>
        </div>
        {loading ? (
          <p className="text-slate-muted">Loading properties...</p>
        ) : error ? (
          <p className="text-brick">{error}</p>
        ) : latest.length === 0 ? (
          <p className="text-slate-muted">No properties listed yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {latest.map((p) => <PropertyCard key={p._id} property={p} />)}
          </div>
        )}
      </section>

      {/* Why choose us */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 mt-24 grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
        <div>
          <p className="eyebrow mb-2">Why Ashland Estates</p>
          <h2 className="text-3xl mb-6">A platform built on trust</h2>
          <div className="space-y-6">
            {[
              ['Verified Listings', 'Every property is reviewed by our team before it goes live.'],
              ['Dedicated Agents', 'Speak directly with the agent responsible for each listing.'],
              ['Transparent Pricing', 'See negotiable status and full specifications up front.'],
            ].map(([title, desc]) => (
              <div key={title} className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-sage-light flex items-center justify-center text-sage font-display flex-shrink-0">✓</div>
                <div>
                  <p className="font-semibold text-navy mb-1">{title}</p>
                  <p className="text-sm text-slate-muted leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-navy rounded-sm p-10 text-ivory">
          <p className="font-display text-2xl mb-4">Have a property to sell?</p>
          <p className="text-ivory/70 mb-6 leading-relaxed">
            Get in touch with our agent team and we'll help you list, price, and market your property.
          </p>
          <Link to="/contact" className="btn-gold">Contact us</Link>
        </div>
      </section>
    </div>
  );
};

export default Home;
