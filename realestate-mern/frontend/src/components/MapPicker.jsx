import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Vite/webpack don't resolve Leaflet's default marker image paths automatically -
// this is a well-known Leaflet quirk. Fix it once, globally, by pointing at the
// bundled image assets directly.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const DEFAULT_CENTER = [27.7172, 85.3240]; // Kathmandu, Nepal - sensible default

const LocationMarker = ({ position, onPick }) => {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return position ? <Marker position={position} /> : null;
};

// react-leaflet's <MapContainer center=...> only applies on the very first
// render - changing the prop later doesn't move the map. This small helper
// imperatively pans/zooms whenever `position` changes (e.g. after "Use my
// current location", or when editing a property whose coordinates arrive
// asynchronously after the map has already mounted).
const MapViewSync = ({ position }) => {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, Math.max(map.getZoom(), 15), { duration: 0.8 });
    }
  }, [position, map]);
  return null;
};

// Lets a property poster click anywhere on the map to drop a pin marking the
// property's exact location, or jump straight to their current live location
// via the browser's Geolocation API. Existing lat/lng (when editing) is
// shown as the starting marker position.
const MapPicker = ({ lat, lng, onChange }) => {
  const [position, setPosition] = useState(
    lat && lng ? [Number(lat), Number(lng)] : null
  );
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');

  // Keep the marker in sync if lat/lng arrive or change after this component
  // has already mounted - e.g. the Edit Property page fetches the property
  // asynchronously, so the very first render has no coordinates yet.
  useEffect(() => {
    if (lat && lng) {
      const next = [Number(lat), Number(lng)];
      setPosition((prev) => (prev && prev[0] === next[0] && prev[1] === next[1] ? prev : next));
    }
  }, [lat, lng]);

  const handlePick = (newLat, newLng) => {
    setPosition([newLat, newLng]);
    setLocationError('');
    onChange(newLat, newLng);
  };

  const handleUseMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocationError("Your browser doesn't support location detection. Please click the map to place the pin manually.");
      return;
    }
    setLocating(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handlePick(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      (err) => {
        let message = 'Could not get your location. Please click the map to place the pin manually.';
        if (err.code === err.PERMISSION_DENIED) {
          message = 'Location access was denied. Please allow location access, or click the map to place the pin manually.';
        } else if (err.code === err.TIMEOUT) {
          message = 'Location request timed out. Please try again, or click the map to place the pin manually.';
        }
        setLocationError(message);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <p className="text-xs text-slate-muted">
          {position
            ? `Pin set at ${position[0].toFixed(5)}, ${position[1].toFixed(5)}. Click the map again to move it.`
            : 'Click anywhere on the map to mark the exact location of this property.'}
        </p>
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={locating}
          className="text-xs font-medium text-brass hover:underline whitespace-nowrap flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
          </svg>
          {locating ? 'Locating...' : 'Use my current location'}
        </button>
      </div>

      <div className="relative z-0 isolate h-72 rounded-sm overflow-hidden border border-navy/15">
        <MapContainer
          center={position || DEFAULT_CENTER}
          zoom={position ? 15 : 12}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationMarker position={position} onPick={handlePick} />
          <MapViewSync position={position} />
        </MapContainer>
      </div>

      {locationError && <p className="text-xs text-brick mt-2">{locationError}</p>}
    </div>
  );
};

export default MapPicker;
