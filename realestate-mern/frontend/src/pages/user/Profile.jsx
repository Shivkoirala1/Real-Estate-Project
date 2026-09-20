import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ProfileHeader from './profile/components/ProfileHeader';
import ProfileStats from './profile/components/ProfileStats';
import ProfileDetailsForm from './profile/components/ProfileDetailsForm';
import IdentityVerification from './profile/components/IdentityVerification';
import ChangePasswordForm from './profile/components/ChangePasswordForm';
import VerificationStatus from './profile/components/VerificationStatus';
import ReferralCard from './profile/components/ReferralCard';
import SupportCard from './profile/components/SupportCard';

// Profile page — container only. It arranges the account experience:
//
//   Header (who am I + account state)
//     -> Shortcuts (saved, listings, post/admin)
//     -> Personal Information | Identity Verification | Security
//     -> Sidebar: verification status, referral, support
//
// Every feature below owns its own state, validation, loading, and errors
// (see ./profile/components/*). The single exception is `selfiePreview`: a
// just-captured, unsaved selfie must show in the header avatar while the
// identity flow owns the capture — a genuine sibling need, so it lives here.
const Profile = () => {
  const { user } = useAuth();
  const [selfiePreview, setSelfiePreview] = useState(null);

  const isAdmin = user?.role === 'admin';
  const isVerified = user?.verificationStatus === 'verified';

  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-10 md:py-14">
      <p className="eyebrow mb-2">Account</p>
      <h1 className="text-3xl mb-8">My Profile</h1>

      <ProfileHeader selfiePreview={selfiePreview} />

      <ProfileStats isAdmin={isAdmin} isVerified={isVerified} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <ProfileDetailsForm />
          {!isAdmin && !isVerified && (
            <IdentityVerification onSelfiePreview={setSelfiePreview} />
          )}
          <ChangePasswordForm />
        </div>

        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24 space-y-6">
            <VerificationStatus />
            <ReferralCard />
            <SupportCard />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
