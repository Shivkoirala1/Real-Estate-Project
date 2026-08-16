import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
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

  const loadAll = async () => {
    const [t, d, c] = await Promise.all([
      api.get('/categories/property-types'),
      api.get('/categories/districts'),
      api.get('/categories/cities'),
    ]);
    setPropertyTypes(t.data.propertyTypes);
    setDistricts(d.data.districts);
    setCities(c.data.cities);
  };

  useEffect(() => { loadAll(); }, []);

  const addType = async (e) => {
    e.preventDefault();
    if (!newType.trim()) return;
    try {
      await api.post('/categories/property-types', { name: newType });
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
      await api.post('/categories/districts', { name: newDistrict });
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
      await api.post('/categories/cities', newCity);
      setNewCity({ name: '', district: '' });
      showToast('City added');
      loadAll();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to add', 'error');
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
      await api.delete(`/categories/${type}/${id}`);
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
            {propertyTypes.map((t) => (
              <div key={t._id} className="flex items-center justify-between border-b border-navy/5 pb-2">
                <span>{t.name}</span>
                <button onClick={() => remove('property-types', t._id)} className="text-brick text-sm hover:underline">Remove</button>
              </div>
            ))}
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
