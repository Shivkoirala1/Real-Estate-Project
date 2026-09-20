import React from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { verificationFor, memberSince } from '../utils/profileDisplay';
import ProfilePhoto from './ProfilePhoto';

// Account identity banner: who am I and what is my account state?
// `selfiePreview` is a freshly captured (not yet saved) selfie, lifted here
// only because both this avatar and the identity capture flow need it.
const ProfileHeader = ({ selfiePreview }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const verification = verificationFor(user?.verificationStatus);
  const since = memberSince(user?.createdAt);

  return (
    <div className="relative bg-navy rounded-sm overflow-hidden mb-6">
      <div className="absolute inset-0 opacity-[0.06]" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, #F7F4EE 0, #F7F4EE 1px, transparent 1px, transparent 40px)'
      }} />
      <div className="relative px-6 md:px-10 py-8 md:py-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
        <ProfilePhoto preview={selfiePreview} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-1.5">
            <h2 className="font-display text-2xl md:text-3xl text-ivory leading-tight truncate">{user?.name}</h2>
            <span className="status-badge bg-white/10 text-ivory capitalize">{user?.role}</span>
            {!isAdmin && (
              <span className={`status-badge inline-flex items-center gap-1.5 ${verification.badgeClass}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${verification.dotClass}`} aria-hidden="true" />
                {verification.label}
              </span>
            )}
          </div>
          <p className="text-ivory/70 text-sm">{user?.email}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ivory/50 text-xs mt-2">
            {user?.phone && <span>{user.phone}</span>}
            {since && <span>Member since {since}</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileHeader;
