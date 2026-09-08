import React, { useEffect, useState } from 'react';
import {
  getPropertyTypes,
  getDistricts,
  getCities,
  createPropertyType,
  updatePropertyType,
  createDistrict,
  createCity,
  deleteCategory,
} from '../../services/categoryService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';

const ManageCategories = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('types');
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [cities, setCities] = useState([]);
  const [newType, setNewType] = useState('');
  const [newDistrict, setNewDistrict] = useState('');
  const [newCity, setNewCity] = useState({ name: '', district: '' });
  // Per-type commission drafts for the inline editor in the Property Types
  // tab, keyed by type _id (untyped entries fall back to the loaded value).
  const [commissionDrafts, setCommissionDrafts] = useState({});
  const [savingCommissionId, setSavingCommissionId] = useState(null);

  const loadAll = async () => {
    const [t, d, c] = await Promise.all([
      getPropertyTypes(),
      getDistricts(),
      getCities(),
    ]);
    setPropertyTypes(t.propertyTypes);
    setDistricts(d.districts);
    setCities(c.cities);
  };

  useEffect(() => { loadAll(); }, []);

  const addType = async (e) => {
    e.preventDefault();
    if (!newType.trim()) return;
    try {
      await createPropertyType(newType);
      setNewType('');
      showToast('Property type added');
      loadAll();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to add', 'error');
    }
  };

  const addDistrict = async (e) => {
    e.preventDefault();
    if (!newDistrict.trim()) return;
    try {
      await createDistrict(newDistrict);
      setNewDistrict('');
      showToast('District added');
      loadAll();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to add', 'error');
    }
  };

  const addCity = async (e) => {
    e.preventDefault();
    if (!newCity.name.trim() || !newCity.district) return;
    try {
      await createCity(newCity);
      setNewCity({ name: '', district: '' });
      showToast('City added');
      loadAll();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to add', 'error');
    }
  };

  const saveCommission = async (t) => {
    const raw = commissionDrafts[t._id];
    const value = raw === undefined || raw === '' ? 0 : Number(raw);
    if (Number.isNaN(value) || value < 0 || value > 100) {
      showToast('Commission must be between 0 and 100', 'error');
      return;
    }
    setSavingCommissionId(t._id);
    try {
      await updatePropertyType(t._id, { defaultCommissionPercentage: value });
      showToast('Commission updated');
      // Update the loaded list in place so the row reflects the saved value.
      setPropertyTypes((prev) =>
        prev.map((pt) => (pt._id === t._id ? { ...pt, defaultCommissionPercentage: value } : pt))
      );
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update commission', 'error');
    } finally {
      setSavingCommissionId(null);
    }
  };

  const remove = async (type, id) => {
    const confirmed = await confirm({
      title: 'Delete this item?',
      message: 'Any properties currently using it will keep their existing value, but it will no longer be selectable for new listings.',
      confirmLabel: 'Yes, delete it',
      cancelLabel: 'No, cancel',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteCategory(type, id);
      showToast('Deleted successfully');
      loadAll();
    } catch (err) {
      showToast('Failed to delete', 'error');
    }
  };

  const tabs = [
    ['types', 'Property Types'],
    ['districts', 'Districts'],
    ['cities', 'Cities'],
  ];

  return (
    <div>
      <p className="eyebrow mb-2">Admin</p>
      <h1 className="text-3xl mb-8">Category Management</h1>

      <div className="flex gap-2 mb-6">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`text-sm px-4 py-2 rounded-sm border ${tab === key ? 'bg-navy text-ivory border-navy' : 'border-navy/15 text-navy'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'types' && (
        <div className="bg-white border border-navy/10 rounded-sm p-6">
          <form onSubmit={addType} className="flex gap-3 mb-6">
            <input className="input-field" placeholder="e.g. Duplex" value={newType} onChange={(e) => setNewType(e.target.value)} />
            <button type="submit" className="btn-primary px-6">Add</button>
          </form>
          <div className="space-y-2">
            {propertyTypes.map((t) => {
              const draft = commissionDrafts[t._id] ?? (t.defaultCommissionPercentage ?? 0);
              const saving = savingCommissionId === t._id;
              return (
                <div key={t._id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-navy/5 pb-2">
                  <span className="font-medium text-navy">{t.name}</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label htmlFor={`commission-${t._id}`} className="text-xs text-slate-muted whitespace-nowrap">
                      Default Commission %
                    </label>
                    <input
                      id={`commission-${t._id}`}
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      className="input-field w-24 py-1.5 text-sm"
                      value={draft}
                      onChange={(e) => setCommissionDrafts((prev) => ({ ...prev, [t._id]: e.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() => saveCommission(t)}
                      disabled={saving}
                      className="btn-gold text-xs px-3 py-1.5 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => remove('property-types', t._id)} className="text-brick text-sm hover:underline">Remove</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'districts' && (
        <div className="bg-white border border-navy/10 rounded-sm p-6">
          <form onSubmit={addDistrict} className="flex gap-3 mb-6">
            <input className="input-field" placeholder="e.g. Sunsari" value={newDistrict} onChange={(e) => setNewDistrict(e.target.value)} />
            <button type="submit" className="btn-primary px-6">Add</button>
          </form>
          <div className="space-y-2">
            {districts.map((d) => (
              <div key={d._id} className="flex items-center justify-between border-b border-navy/5 pb-2">
                <span>{d.name}</span>
                <button onClick={() => remove('districts', d._id)} className="text-brick text-sm hover:underline">Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'cities' && (
        <div className="bg-white border border-navy/10 rounded-sm p-6">
          <form onSubmit={addCity} className="flex gap-3 mb-6">
            <input className="input-field" placeholder="e.g. Itahari" value={newCity.name} onChange={(e) => setNewCity({ ...newCity, name: e.target.value })} />
            <select className="input-field" value={newCity.district} onChange={(e) => setNewCity({ ...newCity, district: e.target.value })}>
              <option value="">Select district</option>
              {districts.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
            <button type="submit" className="btn-primary px-6">Add</button>
          </form>
          <div className="space-y-2">
            {cities.map((c) => (
              <div key={c._id} className="flex items-center justify-between border-b border-navy/5 pb-2">
                <span>{c.name} <span className="text-slate-muted text-xs">({c.district?.name})</span></span>
                <button onClick={() => remove('cities', c._id)} className="text-brick text-sm hover:underline">Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageCategories;
