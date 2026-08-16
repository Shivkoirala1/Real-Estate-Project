import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Read-only map showing exactly where a property is located, for buyers
// viewing the property detail page.
const MapView = ({ lat, lng, title }) => {
  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    return null;
  }

  const position = [Number(lat), Number(lng)];

  return (
    <div className="relative z-0 isolate h-72 rounded-sm overflow-hidden border border-navy/15">
      <MapContainer center={position} zoom={15} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position}>
          <Popup>{title || 'Property location'}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};

export default MapView;
