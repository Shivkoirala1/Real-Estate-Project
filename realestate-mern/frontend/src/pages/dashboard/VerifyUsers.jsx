import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { imageUrl } from '../../utils/format';

const VerifyUsers = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noteDrafts, setNoteDrafts] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/users/verifications/pending');
      setUsers(data.users);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDecision = async (id, status) => {
    if (status === 'rejected') {
      const confirmed = await confirm({
        title: "Reject this user's verification?",
        message: "They'll be notified and won't be able to post properties until they resubmit and are approved.",
        confirmLabel: 'Yes, reject',
        cancelLabel: 'No, cancel',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    try {
      await api.patch(`/users/${id}/verify`, { status, note: noteDrafts[id] || '' });
      showToast(status === 'verified' ? 'User verified — they can now post properties' : 'User verification rejected');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update verification', 'error');
    }
  };

  return (
    <div>
      <p className="eyebrow mb-2">Admin</p>
      <h1 className="text-3xl mb-2">Verify Registrations</h1>
      <p className="text-slate-muted mb-8">Review each user's live selfie against their citizenship photo before approving.</p>

      {loading ? (
        <p className="text-slate-muted">Loading...</p>
      ) : users.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-navy/20 rounded-sm">
          <p className="font-display text-xl">No pending verifications</p>
          <p className="text-sm text-slate-muted mt-1">New registrations will appear here for review.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {users.map((u) => (
            <div key={u._id} className="bg-white border border-navy/10 rounded-sm p-6">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex gap-4 flex-wrap">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Live Selfie</p>
                    {u.selfiePhoto ? (
                      <img src={imageUrl(u.selfiePhoto)} alt="Selfie" className="w-32 h-32 object-cover rounded-sm border border-navy/15" />
                    ) : (
                      <div className="w-32 h-32 bg-parchment flex items-center justify-center text-xs text-slate-muted rounded-sm border border-navy/15">No selfie</div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Citizenship — Front</p>
                    {u.citizenshipPhotoFront ? (
                      <img src={imageUrl(u.citizenshipPhotoFront)} alt="Citizenship front" className="w-32 h-32 object-cover rounded-sm border border-navy/15" />
                    ) : (
                      <div className="w-32 h-32 bg-parchment flex items-center justify-center text-xs text-slate-muted rounded-sm border border-navy/15">No front photo</div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Citizenship — Back</p>
                    {u.citizenshipPhotoBack ? (
                      <img src={imageUrl(u.citizenshipPhotoBack)} alt="Citizenship back" className="w-32 h-32 object-cover rounded-sm border border-navy/15" />
                    ) : (
                      <div className="w-32 h-32 bg-parchment flex items-center justify-center text-xs text-slate-muted rounded-sm border border-navy/15">No back photo</div>
                    )}
                  </div>
                </div>

                <div className="flex-1">
                  <p className="font-display text-lg text-navy">{u.name}</p>
                  <p className="text-sm text-slate-muted mb-1">{u.email}</p>
                  <p className="text-sm text-slate-muted mb-4">{u.phone}</p>

                  <label className="label-field">Note (optional, shown to the user on rejection)</label>
                  <textarea
                    rows={2}
                    className="input-field mb-4"
                    placeholder="e.g. Selfie and ID photo don't appear to match"
                    value={noteDrafts[u._id] || ''}
                    onChange={(e) => setNoteDrafts({ ...noteDrafts, [u._id]: e.target.value })}
                  />

                  <div className="flex gap-3">
                    <button onClick={() => handleDecision(u._id, 'verified')} className="btn-primary text-sm py-2 px-4">
                      Approve
                    </button>
                    <button onClick={() => handleDecision(u._id, 'rejected')} className="text-sm py-2 px-4 rounded-sm border border-brick text-brick hover:bg-brick-light transition-colors">
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VerifyUsers;
