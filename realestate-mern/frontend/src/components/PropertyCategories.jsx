import React from 'react';
import { Link } from 'react-router-dom';
import {
  FcHome,
  FcDepartment,
  FcShop,
  FcLandscape,
  FcGrid,
  FcOrganization,
} from 'react-icons/fc';

const getFlatIcon = (typeName) => {
  const normalized = String(typeName || '').toLowerCase();

  if (normalized.includes('agri') || normalized.includes('land')) {
    return FcLandscape;
  }

  if (normalized.includes('apart')) return FcDepartment;
  if (normalized.includes('commercial')) return FcShop;

  if (
    normalized.includes('house') ||
    normalized.includes('villa')
  ) {
    return FcHome;
  }

  if (normalized.includes('plot')) return FcGrid;
  if (normalized.includes('land')) return FcLandscape;

  return FcOrganization;
};

export default function PropertyCategories({ types = [] }) {
  return (
    <section className="max-w-7xl mx-auto px-5 md:px-8 mt-20">
      <p className="eyebrow mb-2">Categories</p>
      <h2 className="text-3xl mb-8">Browse by property type</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {types.map((t) => {
          const Icon = getFlatIcon(t.name);

          return (
            <Link
              key={t._id}
              to={`/properties?propertyType=${t._id}`}
              className="group flex flex-col items-center justify-center p-6 bg-white rounded-xl border border-slate-200/80 hover:border-amber-500 hover:shadow-xl transition-all duration-300"
            >
              <div className="mb-4 p-3 rounded-full bg-slate-50 group-hover:scale-110 transition-transform duration-300">
                <Icon className="w-9 h-9" />
              </div>

              <p className="font-display text-base text-navy text-center leading-snug">
                {t.name}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}