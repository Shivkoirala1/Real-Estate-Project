// Nepali land measurement conversions.
//
// Nepal uses two parallel traditional systems depending on the region:
//  - Hill/Kathmandu Valley system: Ropani - Aana - Paisa - Daam
//  - Terai (plains) system: Bigha - Kattha - Dhur
//
// Every unit below is defined by its size in square feet (the official
// government survey figures), so converting between ANY two units - even
// across the two systems, or to/from metric/imperial - is just a matter of
// going unit -> sq.ft -> unit. This is the "practical converter" covering
// dhur<->aana, dhur<->kattha, kattha<->bigha, and everything else.

export const SQFT_PER_UNIT = {
  // Hill / Kathmandu Valley system
  ropani: 5476,
  aana: 342.25,
  paisa: 85.5625,
  daam: 21.390625,

  // Terai system
  bigha: 72900,
  kattha: 3645,
  dhur: 182.25,

  // Universal
  sqft: 1,
  sqm: 10.7639104167,
  acre: 43560,
  hectare: 107639.104167,
};

export const UNIT_GROUPS = [
  {
    label: 'Hill / Kathmandu Valley System',
    units: [
      { key: 'ropani', label: 'Ropani' },
      { key: 'aana', label: 'Aana' },
      { key: 'paisa', label: 'Paisa' },
      { key: 'daam', label: 'Daam' },
    ],
  },
  {
    label: 'Terai System',
    units: [
      { key: 'bigha', label: 'Bigha' },
      { key: 'kattha', label: 'Kattha' },
      { key: 'dhur', label: 'Dhur' },
    ],
  },
  {
    label: 'Standard',
    units: [
      { key: 'sqft', label: 'Sq. Feet' },
      { key: 'sqm', label: 'Sq. Meters' },
      { key: 'acre', label: 'Acre' },
      { key: 'hectare', label: 'Hectare' },
    ],
  },
];

export const ALL_UNITS = UNIT_GROUPS.flatMap((g) => g.units);

export const unitLabel = (key) => ALL_UNITS.find((u) => u.key === key)?.label || key;

// Convert a numeric value from one unit to another via square feet.
export const convertLandUnit = (value, fromUnit, toUnit) => {
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  const sqft = num * (SQFT_PER_UNIT[fromUnit] || 0);
  const perTarget = SQFT_PER_UNIT[toUnit] || 1;
  return sqft / perTarget;
};

// Convert a value into every other unit at once - powers the "convert to
// everything" table view.
export const convertToAll = (value, fromUnit) => {
  const num = Number(value);
  if (Number.isNaN(num) || num < 0) return {};
  const sqft = num * (SQFT_PER_UNIT[fromUnit] || 0);
  const result = {};
  Object.keys(SQFT_PER_UNIT).forEach((key) => {
    result[key] = sqft / SQFT_PER_UNIT[key];
  });
  return result;
};

// Nicely format a converted number - trims to a sensible number of decimals
// depending on magnitude, without ugly trailing zeros.
export const formatUnitValue = (num) => {
  if (!Number.isFinite(num)) return '—';
  if (num === 0) return '0';
  const decimals = Math.abs(num) >= 100 ? 2 : Math.abs(num) >= 1 ? 3 : 4;
  return Number(num.toFixed(decimals)).toLocaleString('en-US', { maximumFractionDigits: decimals });
};
