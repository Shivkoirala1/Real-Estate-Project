// Shared lead pipeline constants used across the Lead Management UI.
// Colors match the site palette already used in RevampedInquiries / badges:
// brick, brass, slate-blue, sage, navy, slate-muted.

export const STAGES = [
  'new',
  'contacted',
  'site_visit_scheduled',
  'negotiation',
  'pending_sale_verification',
  'closed',
  'lost',
];

export const STAGE_META = {
  new: {
    label: 'New',
    color: '#A64B42',
    bg: 'bg-brick-light',
    text: 'text-brick',
    description: 'Just entered the pipeline - needs first contact',
  },
  contacted: {
    label: 'Contacted',
    color: '#B08D57',
    bg: 'bg-brass/15',
    text: 'text-brass-dark',
    description: 'Initial outreach made, awaiting response',
  },
  site_visit_scheduled: {
    label: 'Site Visit',
    color: '#4C6FA0',
    bg: 'bg-[#4C6FA0]/10',
    text: 'text-[#3A588A]',
    description: 'Site visit or office meeting booked',
  },
  negotiation: {
    label: 'Negotiation',
    color: '#6B8F71',
    bg: 'bg-sage-light',
    text: 'text-sage',
    description: 'Active deal discussion',
  },
  pending_sale_verification: {
    label: 'Sale Verification',
    color: '#8E6526',
    bg: 'bg-brass/15',
    text: 'text-brass-dark',
    description: 'Sale submitted - awaiting admin verification',
  },
  closed: {
    label: 'Closed',
    color: '#1F2A44',
    bg: 'bg-navy',
    text: 'text-ivory',
    description: 'Deal won',
  },
  lost: {
    label: 'Lost',
    color: '#8A8A82',
    bg: 'bg-[#8A8A82]/15',
    text: 'text-[#6D6D66]',
    description: 'Did not convert',
  },
};

export const SOURCES = ['contact_form', 'property_visit', 'office_visit', 'manual_create'];

export const SOURCE_META = {
  contact_form: { label: 'Contact Form' },
  property_visit: { label: 'Property Visit' },
  office_visit: { label: 'Office Visit' },
  manual_create: { label: 'Manual Entry' },
};

export const CATEGORIES = ['property', 'account', 'billing', 'technical'];
export const PRIORITIES = ['low', 'medium', 'high'];

export const PRIORITY_META = {
  high: { label: 'High', color: '#A64B42', dot: 'bg-brick' },
  medium: { label: 'Medium', color: '#B8863B', dot: 'bg-brass' },
  low: { label: 'Low', color: '#8A8A82', dot: 'bg-[#8A8A82]' },
};

// Accepts legacy capitalized stage values too, so old rows keep rendering.
export const stageMeta = (stage) => {
  if (!stage) return STAGE_META.new;
  const normalized = String(stage).trim().toLowerCase().replace(/\s+/g, '_');
  if (STAGE_META[normalized]) return STAGE_META[normalized];
  // Legacy aliases
  if (normalized === 'office_visit_scheduled') return STAGE_META.site_visit_scheduled;
  return STAGE_META.new;
};

export const sourceMeta = (source) => SOURCE_META[source] || { label: source || 'Unknown' };
