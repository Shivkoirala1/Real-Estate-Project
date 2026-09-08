import React from 'react';
import { Link } from 'react-router-dom';
import { formatPrice, imageUrl } from '../utils/format';
import StatusBadge from './StatusBadge';

const PropertyCard = ({ property }) => {
  return (
    <Link
      to={`/properties/${property.slug || property._id}`}
      className="group block bg-white rounded-sm overflow-hidden shadow-card hover:shadow-lifted transition-shadow duration-200"
    >
      <div className="relative h-52 overflow-hidden bg-parchment">
        <div className="absolute top-0 left-0 z-10 flex flex-col items-start gap-1">
          <StatusBadge type="status" value={property.status} className="rounded-br-sm" />
          <StatusBadge type="saleType" value={property.saleType} className="ml-2" />
        </div>
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
        {property.estimatedCommissionAmount != null && (
          <div className="mt-2 pt-2 border-t border-navy/10 text-xs text-brass-dark font-medium">
            Est. commission: NPR {property.estimatedCommissionAmount.toLocaleString()} ({property.effectiveCommissionPercentage}%)
          </div>
        )}
      </div>
    </Link>
  );
};

export default PropertyCard;
