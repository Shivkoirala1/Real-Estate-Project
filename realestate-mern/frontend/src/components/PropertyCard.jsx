import React from 'react';
import { Link } from 'react-router-dom';
import { formatPrice, statusStyles, imageUrl } from '../utils/format';

const PropertyCard = ({ property }) => {
  const status = statusStyles[property.status] || statusStyles.available;

  return (
    <Link
      to={`/properties/${property.slug || property._id}`}
      className="group block bg-white rounded-sm overflow-hidden shadow-card hover:shadow-lifted transition-shadow duration-200"
    >
      <div className="relative h-52 overflow-hidden bg-parchment">
        <span className="ribbon z-10" style={{ backgroundColor: status.bg }}>{status.label}</span>
        <img
          src={imageUrl(property.media?.coverImage)}
          alt={property.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-navy/85 text-ivory px-4 py-2 text-sm font-semibold">
          {formatPrice(property.price, property.currency)}
          {property.negotiable && <span className="text-brass text-xs font-normal ml-1.5">(Negotiable)</span>}
        </div>
      </div>
      <div className="p-4">
        <p className="font-display text-lg text-navy leading-snug mb-1 line-clamp-1">{property.title}</p>
        <p className="text-sm text-slate-muted mb-3 line-clamp-1">
          {property.location?.city?.name || property.location?.municipality || ''}
          {property.location?.district?.name ? `, ${property.location.district.name}` : ''}
        </p>
        <div className="flex items-center gap-4 text-xs text-slate-ink border-t border-navy/10 pt-3">
          {!!property.details?.bedrooms && <span>{property.details.bedrooms} Beds</span>}
          {!!property.details?.bathrooms && <span>{property.details.bathrooms} Baths</span>}
          {!!property.details?.landArea && <span>{property.details.landArea} {property.details.landAreaUnit}</span>}
        </div>
      </div>
    </Link>
  );
};

export default PropertyCard;
