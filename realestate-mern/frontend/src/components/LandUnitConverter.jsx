import React, { useMemo, useState } from 'react';
import { UNIT_GROUPS, ALL_UNITS, unitLabel, convertLandUnit, convertToAll, formatUnitValue } from '../utils/landUnits';

// A quick reference of the practical rules people actually look up, shown
// under the calculator so the numbers above have context.
const QUICK_FACTS = [
  { pair: '1 Ropani', equals: '16 Aana' },
  { pair: '1 Aana', equals: '4 Paisa' },
  { pair: '1 Paisa', equals: '4 Daam' },
  { pair: '1 Bigha', equals: '20 Kattha' },
  { pair: '1 Kattha', equals: '20 Dhur' },
  { pair: '1 Ropani', equals: '5,476 sq. ft.' },
  { pair: '1 Bigha', equals: '72,900 sq. ft.' },
  { pair: '1 Dhur', equals: '182.25 sq. ft.' },
];

const UnitSelect = ({ value, onChange, id }) => (
  <select id={id} className="input-field" value={value} onChange={(e) => onChange(e.target.value)}>
    {UNIT_GROUPS.map((group) => (
      <optgroup key={group.label} label={group.label}>
        {group.units.map((u) => (
          <option key={u.key} value={u.key}>{u.label}</option>
        ))}
      </optgroup>
    ))}
  </select>
);

/**
 * Nepali land unit converter - single-value quick convert plus a full
 * "convert to everything" table. Works standalone (dedicated page) or
 * embedded inline (e.g. next to the Land Area field when posting a
 * property), controlled by the `compact` prop.
 */
const LandUnitConverter = ({ compact = false, initialValue = '1', initialUnit = 'dhur' }) => {
  const [value, setValue] = useState(initialValue);
  const [fromUnit, setFromUnit] = useState(initialUnit);
  const [toUnit, setToUnit] = useState('kattha');

  const quickResult = useMemo(() => convertLandUnit(value, fromUnit, toUnit), [value, fromUnit, toUnit]);
  const allResults = useMemo(() => convertToAll(value, fromUnit), [value, fromUnit]);

  return (
    <div className={compact ? '' : 'bg-white border border-navy/10 rounded-sm p-6'}>
      {!compact && (
        <>
          <p className="eyebrow mb-2">Land Measurement</p>
          <h2 className="text-2xl mb-1">Nepali Land Unit Converter</h2>
          <p className="text-sm text-slate-muted mb-6">
            Convert between Ropani, Aana, Paisa, Daam, Bigha, Kattha, Dhur, and standard units — dhur to aana,
            dhur to kattha, kattha to bigha, and everything in between.
          </p>
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end mb-4">
        <div>
          <label className="label-field" htmlFor="lc-value">Value</label>
          <input
            id="lc-value"
            type="number"
            min="0"
            step="any"
            className="input-field"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="hidden sm:flex justify-center pb-2.5 text-slate-muted text-sm font-medium">in</div>
        <div>
          <label className="label-field" htmlFor="lc-from">Unit</label>
          <UnitSelect id="lc-from" value={fromUnit} onChange={setFromUnit} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-center mb-6">
        <div className="sm:col-start-3">
          <label className="label-field" htmlFor="lc-to">Convert to</label>
          <UnitSelect id="lc-to" value={toUnit} onChange={setToUnit} />
        </div>
      </div>

      <div className="bg-parchment rounded-sm px-5 py-4 mb-6 flex items-baseline justify-between flex-wrap gap-2">
        <span className="text-sm text-slate-muted">
          {value || 0} {unitLabel(fromUnit)} =
        </span>
        <span className="font-display text-2xl text-navy">
          {formatUnitValue(quickResult)} <span className="text-base text-brass-dark">{unitLabel(toUnit)}</span>
        </span>
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-slate-muted mb-3">
        {value || 0} {unitLabel(fromUnit)} converted to every unit
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {ALL_UNITS.filter((u) => u.key !== fromUnit).map((u) => (
          <div key={u.key} className="border border-navy/10 rounded-sm px-3 py-2.5 bg-white">
            <p className="text-xs text-slate-muted">{u.label}</p>
            <p className="font-semibold text-navy text-sm">{formatUnitValue(allResults[u.key])}</p>
          </div>
        ))}
      </div>

      {!compact && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-muted mb-3">Quick reference</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
            {QUICK_FACTS.map((f) => (
              <p key={f.pair + f.equals} className="text-slate-ink">
                <span className="font-medium text-navy">{f.pair}</span> = {f.equals}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LandUnitConverter;
