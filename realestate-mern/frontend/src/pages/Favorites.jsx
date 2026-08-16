import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import PropertyCard from '../components/PropertyCard';

const Favorites = () => {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFavorites = async () => {
      try {
        const res = await api.get('/properties/my/favorites');
        setFavorites(res.data.favorites || []);
      } catch (err) {
        setFavorites([]);
      } finally {
        setLoading(false);
      }
    };
    fetchFavorites();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-16">
      <p className="eyebrow mb-2">Your list</p>
      <h1 className="text-3xl mb-8">Saved Properties</h1>

      {loading ? (
        <p className="text-slate-muted">Loading...</p>
      ) : favorites.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-navy/20 rounded-sm">
          <p className="font-display text-xl mb-2">You haven't saved any properties yet</p>
          <Link to="/properties" className="text-brass hover:underline text-sm">Browse properties →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {favorites.map((p) => <PropertyCard key={p._id} property={p} />)}
        </div>
      )}
    </div>
  );
};

export default Favorites;
