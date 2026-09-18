// B1 live HTTP role-matrix against an EPHEMERAL in-memory MongoDB.
// Run: node tests/b1-matrix.js
// Spins up mongodb-memory-server, boots server.js against it on PORT 5057,
// seeds B1+B2 fixtures, asserts ACTUAL JSON response shapes per endpoint x role,
// then tears everything down. Nothing touches the remote/dev database.
// Reusable fixture pattern for B3-B6 role-matrix checks.
const { spawn } = require('node:child_process');
const path = require('node:path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

require('dotenv').config(); // parent .env for JWT_SECRET parity with child
process.env.JWT_SECRET = process.env.JWT_SECRET || 'b1-matrix-secret';

const { generateToken } = require('../utils/generateToken');

const BASE = 'http://127.0.0.1:5057/api';
const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? '  :: ' + detail : ''}`);
};
const req = async (method, url, token, body) => {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json };
};
const keys = (o) => (o && typeof o === 'object' ? Object.keys(o) : []);

async function seed() {
  const User = require('../models/User');
  const PropertyType = require('../models/Category').PropertyType
    || require('../models/Category');
  const Property = require('../models/Property');
  const Lead = require('../models/Lead');
  const Sale = require('../models/Sale');
  const Rental = require('../models/Rental');
  const ContactForm = require('../models/ContactForm');
  const Visit = require('../models/Visit');

  const mkUser = (over) => User.create({
    name: 'Seed', email: `${Math.random().toString(36).slice(2)}@t.co`,
    password: 'password123', phone: '9800000001', isEmailVerified: true,
    verificationStatus: 'verified', ...over,
  });
  const admin = await mkUser({ name: 'Admin', email: 'admin@t.co', role: 'admin' });
  const filingAgent = await mkUser({ name: 'Filing', email: 'filing@t.co', role: 'agent' });
  const leadAgent = await mkUser({ name: 'LeadAg', email: 'leadag@t.co', role: 'agent' });
  const buyer = await mkUser({ name: 'Buyer', email: 'buyer@t.co', role: 'user' });
  const pendingUser = await User.create({
    name: 'Pending', email: 'pending@t.co', password: 'password123',
    phone: '9800000002', isEmailVerified: false, verificationStatus: 'pending',
    selfiePhoto: '/s.jpg', citizenshipPhotoFront: '/f.jpg',
    citizenshipPhotoBack: '/b.jpg', verificationNote: 'check me',
    xp: 120, ycCoin: 50, loginStreak: 3, favorites: [],
  });

  const Category = require('../models/Category');
  const ptype = Category.PropertyType
    ? await Category.PropertyType.create({ name: 'House', category: 'building', defaultCommissionPercentage: 2 })
    : await Category.create({ name: 'House' });

  const property = await Property.create({
    title: 'Matrix House', description: 'seed', propertyType: ptype._id,
    price: 1000000, listedBy: filingAgent._id, commissionPercentage: 3,
  });
  const mkLead = (agent) => Lead.create({
    name: 'L', email: `${Math.random().toString(36).slice(2)}@t.co`, phone: '9800000003',
    property: property._id, assignedAgent: agent._id, user: buyer._id,
    notes: 'SECRET-NOTE', activities: [{ type: 'created', message: 'hi', byName: 'Seed' }],
  });
  const lead1 = await mkLead(leadAgent);
  const lead2 = await mkLead(leadAgent);
  const sale = await Sale.create({
    lead: lead1._id, property: property._id, agent: filingAgent._id,
    buyer: { name: 'B', phone: '98', email: 'b@t.co' },
    agreedPrice: 950000, submittedBy: filingAgent._id,
  });
  const rental = await Rental.create({
    lead: lead2._id, property: property._id, agent: filingAgent._id,
    tenant: { name: 'T', phone: '98', email: 't@t.co' },
    monthlyRent: 20000, durationInMonths: 12, startDate: new Date(),
    submittedBy: filingAgent._id,
  });
  const contactForm = await ContactForm.create({
    name: 'C', email: 'c@t.co', subject: 'Hi', message: 'hello',
    user: buyer._id, property: property._id,
  });
  const visit = await Visit.create({
    property: property._id, requestedBy: buyer._id, assignedAgent: filingAgent._id,
    requestedSlot: new Date(Date.now() + 864e5), buyerNotes: 'bn',
    internalNotes: 'SECRET-COORD',
  });
  return { admin, filingAgent, leadAgent, buyer, pendingUser, property, lead1, sale, rental, contactForm, visit };
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri('b1matrix');
  const child = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env, MONGO_URI: uri, PORT: '5057', NODE_ENV: 'test',
      BREVO_API_KEY: '', EMI_REMINDERS_ENABLED: 'false',
      LEAD_REMINDERS_ENABLED: 'false',
      DATA_LIFECYCLE_JOBS_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOut = '';
  child.stdout.on('data', (d) => { serverOut += d; });
  child.stderr.on('data', (d) => { serverOut += d; });
  const stop = async () => {
    child.kill('SIGTERM');
    try { await mongoose.disconnect(); } catch {}
    await mongod.stop();
  };
  process.on('exit', () => { try { child.kill('SIGTERM'); } catch {} });

  // wait for listen
  for (let i = 0; i < 50; i++) {
    try { await fetch('http://127.0.0.1:5057/api/auth/me'); break; }
    catch { await new Promise((r) => setTimeout(r, 200)); }
    if (i === 49) { console.log(serverOut); throw new Error('server did not boot'); }
  }
  await mongoose.connect(uri);
  const f = await seed();
  const T = (u) => generateToken(u._id, u.role);
  const tAdmin = T(f.admin), tFiling = T(f.filingAgent), tLead = T(f.leadAgent), tBuyer = T(f.buyer);
  const STRIP = ['selfiePhoto', 'citizenshipPhotoFront', 'citizenshipPhotoBack', 'xp', 'ycCoin', 'referralCode', 'referredBy', 'favorites', 'loginStreak'];
  const ROSTER = ['_id', 'name', 'email', 'phone', 'role', 'verificationStatus', 'isActive', 'createdAt'];

  // ---- users roster ----
  let r = await req('GET', '/users', tAdmin);
  check('GET /users admin 200', r.status === 200, `status=${r.status}`);
  const u0 = r.json.users[0];
  check('roster absent stripped fields', STRIP.every((k) => !(k in (u0 || {}))), keys(u0).join(','));
  check('roster has allow-list fields', ROSTER.every((k) => k in (u0 || {})), keys(u0).join(','));
  r = await req('GET', '/users', tBuyer);
  check('GET /users buyer 403', r.status === 403, `status=${r.status}`);
  r = await req('GET', '/users', null);
  check('GET /users anon 401', r.status === 401, `status=${r.status}`);
  r = await req('GET', `/users/${f.buyer._id}`, tAdmin);
  check('GET /users/:id admin bounded', r.status === 200 && STRIP.every((k) => !(k in (r.json.user || {}))), `status=${r.status} keys=${keys(r.json.user)}`);
  r = await req('GET', '/users/verifications/pending', tAdmin);
  const pv = (r.json.users || []).find((u) => String(u._id) === String(f.pendingUser._id));
  check('pending 200 + subject present', r.status === 200 && !!pv, `status=${r.status}`);
  check('pending has photos+note', pv && ['selfiePhoto', 'citizenshipPhotoFront', 'citizenshipPhotoBack', 'verificationNote'].every((k) => k in pv), keys(pv).join(','));
  check('pending lacks gamification', pv && ['xp', 'ycCoin', 'referralCode', 'favorites'].every((k) => !(k in pv)), keys(pv).join(','));

  // ---- reset ----
  const User = require('../models/User');
  const before = await User.findById(f.buyer._id).select('+password').lean();
  r = await req('POST', `/users/${f.buyer._id}/reset-password`, tAdmin, {});
  check('reset admin 200', r.status === 200, `status=${r.status} ${JSON.stringify(r.json)}`);
  check('reset body has no secret', r.json && !('tempPassword' in r.json) && !('code' in r.json), JSON.stringify(r.json));
  const after = await User.findById(f.buyer._id).select('+password +passwordResetCodeHash +passwordResetExpires').lean();
  check('reset sets single-use hash+expiry', !!after.passwordResetCodeHash && !!after.passwordResetExpires, '');
  check('reset keeps old password until code used', String(before.password) === String(after.password), '');
  check('reset email path fired (console fallback)', /EMAIL \(BREVO_API_KEY not configured/.test(serverOut), 'no email log in server output');
  r = await req('POST', '/auth/login', null, { email: 'buyer@t.co', password: 'password123' });
  check('old password still logs in', r.status === 200, `status=${r.status}`);
  r = await req('POST', `/users/${f.buyer._id}/reset-password`, tBuyer, {});
  check('reset buyer 403', r.status === 403, `status=${r.status}`);

  // ---- sale/rental detail ----
  for (const [label, path, agent] of [['sale', `/sales/${f.sale._id}`], ['rental', `/rentals/${f.rental._id}`]]) {
    r = await req('GET', path, tAdmin);
    const doc = r.json.sale || r.json.rental;
    check(`${label} admin 200`, r.status === 200, `status=${r.status}`);
    check(`${label} lead bounded`, doc && ['_id', 'name', 'email', 'phone', 'stage'].every((k) => k in (doc.lead || {})), keys(doc?.lead).join(','));
    check(`${label} lead leaks nothing`, doc && ['notes', 'activities', 'contactForm', 'visit', 'user', 'source'].every((k) => !(k in (doc.lead || {}))), keys(doc?.lead).join(','));
    r = await req('GET', path, tFiling);
    check(`${label} filing-agent 200`, r.status === 200, `status=${r.status}`);
    r = await req('GET', path, tLead);
    check(`${label} lead-agent 200`, r.status === 200, `status=${r.status}`);
    r = await req('GET', path, tBuyer);
    check(`${label} unrelated buyer 403`, r.status === 403, `status=${r.status}`);
  }

  // ---- contact respond ----
  r = await req('PATCH', `/contact-forms/${f.contactForm._id}/respond`, tAdmin, { response: 'Thanks!' });
  check('respond admin 200', r.status === 200, `status=${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  const cfu = r.json.contactForm?.user;
  const cfuKeys = cfu && typeof cfu === 'object' ? keys(cfu) : [];
  check('respond user bounded (id or minimal)', cfu == null || typeof cfu === 'string' || (cfuKeys.length <= 3 && cfuKeys.every((k) => ['_id', 'name', 'email'].includes(k))), JSON.stringify(cfu)?.slice(0, 200));

  // ---- visits update ----
  r = await req('PATCH', `/visits/${f.visit._id}`, tAdmin, { internalNotes: 'admin-note' });
  check('visit admin echo keeps notes', r.status === 200 && r.json.visit?.internalNotes === 'admin-note', `status=${r.status}`);
  r = await req('PATCH', `/visits/${f.visit._id}`, tFiling, { internalNotes: 'agent-note' });
  check('visit assigned-agent echo keeps notes', r.status === 200 && r.json.visit?.internalNotes === 'agent-note', `status=${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
  r = await req('PATCH', `/visits/${f.visit._id}`, tBuyer, { internalNotes: 'x' });
  check('visit buyer 403 (routeAuthorize)', r.status === 403, `status=${r.status}`);
  // buyer-visible read still stripped
  r = await req('GET', '/visits/my-visits', tBuyer);
  const mv = (r.json.visits || [])[0];
  check('my-visits buyer has no internalNotes', r.status === 200 && mv && !('internalNotes' in mv), `status=${r.status} keys=${keys(mv)}`);

  // ---- property detail gate ----
  r = await req('GET', `/properties/${f.property._id}`, null);
  check('property anon 200', r.status === 200, `status=${r.status}`);
  check('property anon no phone/email', r.json.property && !('phone' in (r.json.property.listedBy || {})) && !('email' in (r.json.property.listedBy || {})), keys(r.json.property?.listedBy).join(','));
  check('property anon keeps identity', ['name', 'selfiePhoto', 'verificationStatus', 'createdAt'].every((k) => k in (r.json.property?.listedBy || {})), keys(r.json.property?.listedBy).join(','));
  r = await req('GET', `/properties/${f.property._id}`, tBuyer);
  check('property authed buyer sees contact', r.status === 200 && 'phone' in (r.json.property?.listedBy || {}) && 'email' in (r.json.property?.listedBy || {}), keys(r.json.property?.listedBy).join(','));

  await runB2({ tAdmin, tFiling, tLead, tBuyer, f });
  await runB3({ tAdmin, tFiling, tLead, tBuyer, f });
  await runB4({ tAdmin, tFiling, tLead, tBuyer, f });
  await runPM({ tAdmin, f });
  await runSliceB({ tAdmin, tFiling, tBuyer, f });
  await runLeadReminders({ f });
  await runLeadClose({ tAdmin, tLead, f });
  await runAnalyticsExport({ tAdmin, tLead });

  const fails = results.filter((x) => !x.pass);
  console.log(`\nB1+B2+B3+B4+B6+PM+SliceB live matrix: ${results.length - fails.length}/${results.length} pass`);
  await stop();
  if (fails.length) process.exit(1);
}

// ---- B2 bulk fixtures (multi-doc: pagination needs volume, not singles) ----
async function seedB2(f) {
  const Property = require('../models/Property');
  const Lead = require('../models/Lead');
  const Sale = require('../models/Sale');
  const Rental = require('../models/Rental');
  const Visit = require('../models/Visit');
  const Notification = require('../models/Notification');
  const CommissionRecord = require('../models/CommissionRecord');
  const User = require('../models/User');

  const ptype = (await Property.findById(f.property._id).select('propertyType').lean()).propertyType;
  const props = [f.property];
  for (let i = 1; i < 12; i++) {
    props.push(await Property.create({
      title: `Matrix House ${i}`, description: `seed body ${i}`, propertyType: ptype,
      price: 1000000 + i * 10000, listedBy: f.filingAgent._id, commissionPercentage: 3,
    }));
  }
  // buyer favorites two properties (me -> favoriteIds/count)
  await User.findByIdAndUpdate(f.buyer._id, { favorites: [props[0]._id, props[1]._id] });

  // extra leads (one fully linked for _id-link assertions) + deals
  const mkLead = (i, extra = {}) => Lead.create({
    name: `L${i}`, email: `lx${i}@t.co`, phone: '9800000003',
    property: props[0]._id, assignedAgent: f.leadAgent._id, user: f.buyer._id,
    notes: `n${i}`, ...extra,
  });
  const leads = [];
  for (let i = 0; i < 8; i++) {
    leads.push(await mkLead(i, i === 0 ? { contactForm: f.contactForm._id, visit: f.visit._id } : {}));
  }
  const sales = [], rentals = [];
  for (let i = 0; i < 4; i++) {
    const l = await mkLead(`s${i}`);
    sales.push(await Sale.create({
      lead: l._id, property: props[0]._id, agent: f.filingAgent._id,
      buyer: i === 0
        ? { name: 'Guest', phone: '', email: '' }
        : { name: `B${i}`, phone: '98', email: `b${i}@t.co`, user: f.buyer._id },
      agreedPrice: 900000 + i, submittedBy: f.filingAgent._id,
      remarks: `rm${i}`, rejectionReason: i === 1 ? 'rr1' : undefined,
    }));
    const l2 = await mkLead(`r${i}`);
    rentals.push(await Rental.create({
      lead: l2._id, property: props[0]._id, agent: f.filingAgent._id,
      tenant: { name: `T${i}`, phone: '98', email: `t${i}@t.co`, user: f.buyer._id },
      monthlyRent: 20000, durationInMonths: 12, startDate: new Date(),
      submittedBy: f.filingAgent._id, remarks: `rrm${i}`,
    }));
  }
  // 25 visits: 5 statuses x 5, slots deliberately unordered within status
  const statuses = ['pending_agent_review', 'confirmed', 'completed', 'rejected', 'cancelled'];
  const base = Date.now();
  const slotOffsets = [30, 3, 18, 7, 42, 1, 25, 11, 36, 5, 21, 9, 44, 2, 28, 15, 39, 6, 24, 12, 33, 4, 27, 10, 20];
  const visits = [];
  for (let i = 0; i < 25; i++) {
    visits.push(await Visit.create({
      property: props[0]._id, requestedBy: f.buyer._id, assignedAgent: f.filingAgent._id,
      requestedSlot: new Date(base + slotOffsets[i] * 36e5),
      status: statuses[i % 5], internalNotes: `coord-${i}`,
    }));
  }
  for (let i = 0; i < 3; i++) {
    await Notification.create({
      recipient: f.buyer._id, type: 'lead_assigned', title: `T${i}`, message: `M${i}`,
      property: props[0]._id, link: `/properties/${props[0]._id}`,
    });
  }
  await CommissionRecord.create([
    { property: props[0]._id, agent: f.filingAgent._id, sale: f.sale._id, transactionAmount: 950000, commissionPercentage: 3, commissionAmount: 28500 },
    { property: props[0]._id, agent: f.filingAgent._id, rental: f.rental._id, transactionAmount: 240000, commissionPercentage: 5, commissionAmount: 12000 },
    { property: props[0]._id, agent: f.filingAgent._id, transactionAmount: 100, commissionPercentage: 1, commissionAmount: 1 },
  ]);
  return { props, leads, sales, rentals, visits };
}

async function runB2({ tAdmin, tFiling, tLead, tBuyer, f }) {
  const b2 = await seedB2(f);
  let r;

  // ---- B2.1 property card DTO ----
  const CARD_ALLOW = new Set(['_id', 'slug', 'title', 'price', 'currency', 'negotiable', 'status', 'saleType', 'commissionPercentage', 'media', 'location', 'details', 'propertyType', 'listedBy', 'createdAt', 'updatedAt', '__v', 'id', 'effectiveCommissionPercentage', 'estimatedCommissionAmount']);
  r = await req('GET', '/properties?limit=12', null);
  check('B2 props anon 200', r.status === 200, `status=${r.status}`);
  const p0 = (r.json.properties || [])[0] || {};
  check('B2 card drops heavy fields', ['description', 'views', 'shares', 'soldTo', 'isArchived'].every((k) => !(k in p0)) && !('images' in (p0.media || {})), keys(p0).join(','));
  check('B2 card keys ⊆ allow-list', keys(p0).every((k) => CARD_ALLOW.has(k)), keys(p0).join(','));
  check('B2 card listedBy minimal', keys(p0.listedBy || {}).every((k) => ['_id', 'name'].includes(k)), JSON.stringify(p0.listedBy));
  check('B2 card anon no commission', !('effectiveCommissionPercentage' in p0) && !('estimatedCommissionAmount' in p0), keys(p0).join(','));
  r = await req('GET', '/properties?limit=12', tFiling);
  check('B2 card agent keeps commission', r.status === 200 && 'effectiveCommissionPercentage' in ((r.json.properties || [])[0] || {}), '');
  r = await req('GET', '/properties?keyword=Matrix%20House%201&limit=12', null);
  check('B2 keyword still matches (server-side)', r.status === 200 && (r.json.properties || []).length > 0, `total=${r.json.total}`);

  // ---- B2.2 favorites + me ----
  r = await req('GET', '/properties/my/favorites', tBuyer);
  const fav0 = (r.json.favorites || [])[0] || {};
  check('B2 favorites card-shaped', r.status === 200 && (r.json.favorites || []).length === 2 && !('description' in fav0), `n=${(r.json.favorites || []).length} keys=${keys(fav0)}`);
  r = await req('GET', '/auth/me', tBuyer);
  check('B2 me favoriteIds+count, no docs', r.status === 200 && Array.isArray(r.json.user?.favoriteIds) && r.json.user.favoriteIds.length === 2 && r.json.user.favoritesCount === 2 && !('favorites' in (r.json.user || {})), keys(r.json.user).join(','));

  // ---- B2.3 sales/rentals lists ----
  r = await req('GET', '/sales?limit=10', tAdmin);
  const s0 = (r.json.sales || []).find((s) => s.buyer?.name === 'B1') || {};
  check('B2 sales 200 + counters', r.status === 200 && r.json.countsByStatus != null, `status=${r.status}`);
  check('B2 sale lead is id-only', typeof s0.lead === 'string', `lead=${JSON.stringify(s0.lead)?.slice(0, 80)}`);
  check('B2 sale buyer registered flag', s0.buyer?.registered === true && !('user' in (s0.buyer || {})), JSON.stringify(s0.buyer));
  check('B2 sale keeps remarks/rejectionReason (D1)', 'remarks' in s0, keys(s0).join(','));
  check('B2 sale drops activities', !('activities' in s0), keys(s0).join(','));
  const guest = (r.json.sales || []).find((s) => s.buyer?.name === 'Guest') || {};
  check('B2 guest sale registered=false', guest.buyer?.registered === false, JSON.stringify(guest.buyer));
  r = await req('GET', '/rentals?limit=10', tAdmin);
  const t0 = (r.json.rentals || [])[0] || {};
  check('B2 rental tenant registered, no user obj', t0.tenant?.registered === true && !('user' in (t0.tenant || {})) && typeof t0.lead === 'string' && !('activities' in t0), `tenant=${JSON.stringify(t0.tenant)}`);

  // ---- B2.4 leads lists ----
  r = await req('GET', '/leads?limit=10', tAdmin);
  const l0 = (r.json.leads || []).find((l) => l.contactForm) || (r.json.leads || [])[0] || {};
  const isRef = (v) => v == null || typeof v === 'string' || (typeof v === 'object' && keys(v).length <= 1);
  check('B2 leads 200', r.status === 200, `status=${r.status}`);
  check('B2 lead contactForm/visit/user are refs not objects', isRef(l0.contactForm) && isRef(l0.visit) && isRef(l0.user), `cf=${JSON.stringify(l0.contactForm)} v=${JSON.stringify(l0.visit)} u=${JSON.stringify(l0.user)}`);
  check('B2 lead keeps property+assignee', l0.property?.title != null && l0.assignedAgent?.name != null, `keys=${keys(l0)}`);
  r = await req('GET', '/leads/my-leads?limit=100', tLead);
  check('B2 my-leads trimmed too', r.status === 200 && (r.json.leads || []).every((l) => isRef(l.contactForm) && isRef(l.visit) && isRef(l.user)), `status=${r.status}`);

  // ---- B2.5 visits DB pagination: order parity + query-log proof ----
  const Visit = require('../models/Visit');
  const PRIORITY = { pending_agent_review: 0, confirmed: 1, completed: 2, rejected: 3, cancelled: 3 };
  const all = await Visit.find({}).select('_id status requestedSlot').lean();
  const expected = [...all].sort((a, b) => (PRIORITY[a.status] ?? 9) - (PRIORITY[b.status] ?? 9) || new Date(a.requestedSlot) - new Date(b.requestedSlot)).map((v) => String(v._id));
  // profiler: every visits op during the window must be bounded (aggregate w/ skip+limit, or _id-$in find, or count)
  const db = mongoose.connection.db;
  let profiling = true;
  try { await db.command({ profile: 2 }); } catch { profiling = false; }
  // system.profile is read-only on this server build: scope by timestamp.
  const profSince = new Date();
  const pages = [];
  for (const page of [1, 2, 3]) {
    r = await req('GET', `/visits?page=${page}&limit=10`, tAdmin);
    if (r.status !== 200) break;
    pages.push(...(r.json.visits || []).map((v) => String(v._id)));
  }
  const prof = profiling ? await db.collection('system.profile').find({ ns: { $regex: /visits$/ }, ts: { $gt: profSince } }).toArray() : [];
  try { await db.command({ profile: 0 }); } catch {}
  check('B2 visits byte-for-byte order parity (all pages)', pages.length === expected.length && pages.every((id, i) => id === expected[i]), `got=${pages.length} want=${expected.length}`);
  if (profiling) {
    const aggs = prof.filter((e) => e.command?.aggregate === 'visits');
    const finds = prof.filter((e) => e.command?.find === 'visits');
    const pipe = JSON.stringify(aggs.map((e) => e.command.pipeline));
    check('B2 visits aggregate uses $skip+$limit at DB level', aggs.length > 0 && pipe.includes('$skip') && pipe.includes('$limit'), `aggs=${aggs.length}`);
    check('B2 no unbounded visits.find (only _id-$in pages)', finds.every((e) => e.command?.filter?._id?.$in != null), `finds=${finds.length} unbounded=${finds.filter((e) => e.command?.filter?._id?.$in == null).length}`);
  } else {
    check('B2 profiler available', false, 'setProfilingLevel unsupported on this server');
  }
  r = await req('GET', '/visits?page=1&limit=10', tAdmin);
  check('B2 visits pagination consistent', r.status === 200 && r.json.pagination?.total >= 25 && r.json.count <= 10, JSON.stringify(r.json.pagination));

  // ---- B2.6 notifications ----
  r = await req('GET', '/notifications?limit=10', tBuyer);
  const n0 = (r.json.notifications || [])[0] || {};
  // Populate dropped: `property` must be a scalar ref (or null), never an object.
  const nProp = n0.property;
  check('B2 notifications drop property populate', r.status === 200 && (nProp == null || typeof nProp === 'string') && r.json.unreadCount >= 3, `property=${JSON.stringify(nProp)?.slice(0, 80)} unread=${r.json.unreadCount}`);

  // ---- B2.7 commissions ----
  r = await req('GET', '/commissions?limit=10', tAdmin);
  const c0 = (r.json.commissions || [])[0] || {};
  const saleVal = c0.sale;
  check('B2 commissions 200 + totals', r.status === 200 && r.json.totals != null, `status=${r.status}`);
  check('B2 commission sale not populated', saleVal == null || typeof saleVal === 'string', `sale=${JSON.stringify(saleVal)?.slice(0, 100)}`);
}

// ---- Slice B: management services, management-purpose property, wizard ----
async function runSliceB({ tAdmin, tFiling, tBuyer, f }) {
  const mongoose = require('mongoose');
  const Property = require('../models/Property');
  const Lead = require('../models/Lead');
  let r;

  // ---- B1 services CRUD + retirement safety ----
  r = await req('GET', '/management-services', tBuyer);
  check('SB services lazy-seed 8 active', r.status === 200 && (r.json.services || []).length === 8, `status=${r.status} n=${(r.json.services || []).length}`);
  r = await req('GET', '/management-services', null);
  check('SB catalogue public: anonymous GET 200 active-only', r.status === 200 && (r.json.services || []).length >= 8 && (r.json.services || []).every((s) => s.isActive !== false), `status=${r.status} n=${(r.json.services || []).length}`);
  r = await req('POST', '/management-services', null, { name: 'anon_create' });
  check('SB catalogue mutation: anonymous POST 401', r.status === 401, `status=${r.status}`);
  r = await req('POST', '/management-services', tAdmin, { name: 'pool_care', description: 'Pool upkeep' });
  check('SB service create 201', r.status === 201, `status=${r.status}`);
  const svcId = r.json.service?._id;
  r = await req('PATCH', `/management-services/${svcId}`, tAdmin, { description: 'Pool & garden' });
  check('SB service edit', r.status === 200 && r.json.service?.description === 'Pool & garden', `status=${r.status}`);
  r = await req('POST', '/management-services', tBuyer, { name: 'x' });
  check('SB service create buyer 403', r.status === 403, `status=${r.status}`);
  // request referencing pool_care, then deactivate -> history keeps the name
  const ptype = (await Property.findById(f.property._id).select('propertyType').lean()).propertyType;
  const oid = () => new mongoose.Types.ObjectId();
  const mgmtProp = {
    title: 'MG', description: 'm', propertyType: ptype,
    saleType: 'management',
    location: { district: oid(), city: oid(), mapLocation: { lat: 27.7, lng: 85.3 } },
    details: { landArea: 5, builtUpArea: 100, bedrooms: 2, bathrooms: 1, floors: 1 },
  };
  r = await req('POST', '/property-management/with-property', tBuyer, {
    property: mgmtProp, services: ['pool_care'], note: 'n',
  });
  check('SB wizard creates property+pending request', r.status === 201 && r.json.property?.saleType === 'management' && r.json.request?.status === 'pending', `status=${r.status} body=${JSON.stringify(r.json).slice(0, 300)}`);
  const reqWithRetired = r.json.request;
  r = await req('PATCH', `/management-services/${svcId}/status`, tAdmin, { isActive: false });
  check('SB service deactivate', r.status === 200 && r.json.service?.isActive === false, `status=${r.status}`);
  r = await req('GET', '/management-services', tBuyer);
  check('SB owner sees active only', (r.json.services || []).every((s) => s.isActive !== false) && !(r.json.services || []).some((s) => s.name === 'pool_care'), `n=${(r.json.services || []).length}`);
  r = await req('GET', '/management-services', null);
  check('SB public sees active only after deactivate', r.status === 200 && !(r.json.services || []).some((s) => s.name === 'pool_care'), `status=${r.status} n=${(r.json.services || []).length}`);
  r = await req('GET', '/management-services?includeInactive=true', tAdmin);
  check('SB admin includeInactive sees retired service', r.status === 200 && (r.json.services || []).some((s) => s.name === 'pool_care' && s.isActive === false), `status=${r.status} n=${(r.json.services || []).length}`);
  r = await req('GET', '/management-services?includeInactive=true', null);
  check('SB anonymous includeInactive still active-only', r.status === 200 && !(r.json.services || []).some((s) => s.name === 'pool_care'), `status=${r.status} n=${(r.json.services || []).length}`);
  r = await req('PATCH', `/management-services/${svcId}/status`, null, { isActive: true });
  check('SB catalogue mutation: anonymous PATCH 401', r.status === 401, `status=${r.status}`);
  r = await req('GET', `/property-management/${reqWithRetired._id}`, tAdmin);
  check('SB retired service still displays on history', (r.json.request?.services || []).includes('pool_care'), JSON.stringify(r.json.request?.services));
  r = await req('POST', '/property-management', tBuyer, { property: f.property._id, services: ['pool_care'] });
  check('SB deactivated service rejected on new request', r.status === 400, `status=${r.status}`);

  // ---- B2 management-purpose property validation ----
  r = await req('POST', '/properties', tBuyer, { ...mgmtProp, title: 'MG2', description: 'm2' });
  check('SB direct management create (no price/cover) 201', r.status === 201 - 0 || r.status === 201, `status=${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  const mgmtId = r.json.property?._id;
  const mgmtSlug = r.json.property?.slug;
  r = await req('POST', '/properties', tBuyer, { ...mgmtProp, title: 'MG3', description: 'm3', saleType: 'bogus' });
  check('SB invalid saleType 400', r.status === 400, `status=${r.status}`);
  r = await req('POST', '/properties', tBuyer, { ...mgmtProp, title: 'A proper sale title here', description: 'a proper sale description over thirty chars', saleType: 'sale', price: undefined });
  check('SB sale still requires price', r.status === 400, `status=${r.status}`);

  // ---- B3 transaction rollback: forced failure creates neither ----
  const beforeProps = await Property.countDocuments({});
  const { default: PM } = { default: null };
  const PMReq = require('../models/PropertyManagementRequest');
  const beforeReqs = await PMReq.countDocuments({});
  r = await req('POST', '/property-management/with-property', tBuyer, {
    property: { ...mgmtProp, title: 'MGX', description: 'mx' }, services: ['no_such_service'],
  });
  check('SB wizard bad service 400', r.status === 400, `status=${r.status}`);
  const afterProps = await Property.countDocuments({});
  const afterReqs = await PMReq.countDocuments({});
  check('SB rollback: neither property nor request created', afterProps === beforeProps && afterReqs === beforeReqs, `props ${beforeProps}->${afterProps} reqs ${beforeReqs}->${afterReqs}`);

  // ---- B4 owner surfaces ----
  r = await req('GET', '/property-management/my-requests', tBuyer);
  check('SB owner list works', r.status === 200 && (r.json.requests || []).length >= 1, `status=${r.status}`);
  r = await req('GET', `/property-management/${reqWithRetired._id}`, tBuyer);
  check('SB owner detail works', r.status === 200 && r.json.request?._id != null, `status=${r.status}`);

  // ---- B6 visibility exclusion + filing guards (live proof) ----
  r = await req('GET', '/properties?limit=50', null);
  const leakedList = (r.json.properties || []).some((p) => p.saleType === 'management');
  check('SB public list excludes management', r.status === 200 && !leakedList, `n=${(r.json.properties || []).length}`);
  r = await req('GET', `/properties/${mgmtId}`, null);
  check('SB anon detail 404', r.status === 404, `status=${r.status}`);
  if (mgmtSlug) {
    r = await req('GET', `/properties/${mgmtSlug}`, null);
    check('SB anon slug 404', r.status === 404, `status=${r.status}`);
  }
  r = await req('GET', `/properties/${mgmtId}`, tBuyer);
  check('SB owner detail 200', r.status === 200, `status=${r.status}`);
  r = await req('GET', `/properties/${mgmtId}`, tAdmin);
  check('SB admin detail 200', r.status === 200, `status=${r.status}`);
  r = await req('GET', '/properties?limit=50', null);
  const simLeak = (r.json.properties || []).some((p) => (p.similarProperties || []).some((s) => s.saleType === 'management'));
  check('SB similar surfaces carry no management (list probe)', !simLeak, '');
  // sale/rental filing guards need a lead on the management property
  const mlead = await Lead.create({ name: 'ML', email: 'ml@t.co', property: mgmtId, assignedAgent: f.leadAgent._id });
  r = await req('POST', '/sales', tFiling, { lead: mlead._id, property: mgmtId, buyer: { name: 'B', email: 'b@t.co' }, agreedPrice: 10 });
  check('SB sale-file on management 400', r.status === 400, `status=${r.status} ${JSON.stringify(r.json).slice(0, 100)}`);
  r = await req('POST', '/rentals', tFiling, { lead: mlead._id, property: mgmtId, tenant: { name: 'T' }, monthlyRent: 10, durationInMonths: 1, startDate: new Date() });
  check('SB rental-file on management 400', r.status === 400, `status=${r.status} ${JSON.stringify(r.json).slice(0, 100)}`);
}

// ---- B3 fixtures: threads (fetchable + 403), EMI plan with slip, visit detail ----
async function seedB3(f) {
  const Conversation = require('../models/Conversation');
  const Lead = require('../models/Lead');
  const Sale = require('../models/Sale');
  const EMIPlan = require('../models/EMIPlan');

  const threadA = await Conversation.create({
    inquirer: f.buyer._id, owner: f.leadAgent._id, lead: f.lead1._id,
    property: f.property._id, lastMessageAt: new Date(),
    messages: [
      { sender: f.buyer._id, senderName: 'Buyer', side: 'inquirer', body: 'hello' },
      { sender: f.leadAgent._id, senderName: 'LeadAg', side: 'owner', body: 'hi back' },
    ],
  });
  // owner is a different agent: leadAgent (assigned) is NOT a participant -> 403
  const threadB = await Conversation.create({
    inquirer: f.buyer._id, owner: f.filingAgent._id, lead: f.lead1._id,
    property: f.property._id, lastMessageAt: new Date(Date.now() - 36e5), isActive: false,
    messages: [{ sender: f.buyer._id, senderName: 'Buyer', side: 'inquirer', body: 'other' }],
  });
  await Lead.findByIdAndUpdate(f.lead1._id, { conversationThreads: [threadA._id, threadB._id] });

  const lx = await Lead.create({
    name: 'Lx', email: 'lx@t.co', property: f.property._id,
    assignedAgent: f.leadAgent._id, user: f.buyer._id,
  });
  const saleX = await Sale.create({
    lead: lx._id, property: f.property._id, agent: f.filingAgent._id,
    buyer: { name: 'Bx', phone: '98', email: 'bx@t.co', user: f.buyer._id },
    agreedPrice: 800000, submittedBy: f.filingAgent._id,
  });
  const plan = await EMIPlan.create({
    sale: saleX._id, property: f.property._id, buyer: f.buyer._id, agent: f.filingAgent._id,
    principalAmount: 700000, tenureMonths: 2, installmentAmount: 350000,
    startDate: new Date(),
    installments: [
      {
        installmentNumber: 1, dueDate: new Date(Date.now() + 864e5), amount: 350000,
        status: 'pending',
        verification: {
          status: 'pending', requestedAmount: 350000, requestedDate: new Date(),
          paymentSlipUrl: 'http://x/slip.jpg', note: 'paid via bank',
          submittedAt: new Date(), reviewNote: 'looks ok',
        },
      },
      { installmentNumber: 2, dueDate: new Date(Date.now() + 30 * 864e5), amount: 350000, status: 'pending' },
    ],
  });
  return { threadA, threadB, plan };
}

async function runB3({ tAdmin, tFiling, tLead, tBuyer, f }) {
  const b3 = await seedB3(f);
  let r;

  // ---- B3.1 thread summaries ----
  r = await req('GET', `/leads/${f.lead1._id}`, tAdmin);
  check('B3 lead detail 200', r.status === 200, `status=${r.status}`);
  const threads = r.json.lead?.conversationThreads || [];
  check('B3 threads are summaries (no messages/inquirer)', r.status === 200 && threads.length === 2 && threads.every((t) => !('messages' in t) && !('inquirer' in t)), `keys=${keys(threads[0]).join(',')}`);
  check('B3 summary keeps link fields', threads.every((t) => t._id && t.property?.title != null && t.owner?._id && 'lastMessageAt' in t && 'isActive' in t), JSON.stringify(threads[0]).slice(0, 160));
  // normal case: assigned agent (owner of A) fetches bodies
  r = await req('GET', `/conversations/${b3.threadA._id}`, tLead);
  check('B3 thread fetch normal case (owner-agent 200 + 2 msgs)', r.status === 200 && (r.json.conversation?.messages || []).length === 2, `status=${r.status}`);
  // 403-fallback case: assigned agent is NOT a participant of B
  r = await req('GET', `/conversations/${b3.threadB._id}`, tLead);
  check('B3 thread fetch 403-fallback case (non-participant agent)', r.status === 403, `status=${r.status}`);
  // admin normal case on the same thread
  r = await req('GET', `/conversations/${b3.threadB._id}`, tAdmin);
  check('B3 thread fetch normal case (admin 200 + 1 msg)', r.status === 200 && (r.json.conversation?.messages || []).length === 1, `status=${r.status}`);
  // reply -> loadLead refresh keeps summary shape (refresh loop, not just mount)
  r = await req('PATCH', `/conversations/${b3.threadA._id}/messages`, tLead, { message: 'follow up' });
  check('B3 reply posts', r.status === 200, `status=${r.status}`);
  r = await req('GET', `/leads/${f.lead1._id}`, tAdmin);
  const reThreads = r.json.lead?.conversationThreads || [];
  check('B3 post-reply refresh still summary-shaped', reThreads.length === 2 && reThreads.every((t) => !('messages' in t)), '');
  r = await req('GET', `/conversations/${b3.threadA._id}`, tLead);
  check('B3 post-reply refetch sees 3 msgs', r.status === 200 && (r.json.conversation?.messages || []).length === 3, `n=${(r.json.conversation?.messages || []).length}`);

  // ---- B3.2 EMI list trim ----
  r = await req('GET', '/emi-plans?limit=10', tAdmin);
  const plan = (r.json.plans || []).find((p) => String(p._id) === String(b3.plan._id)) || {};
  const v0 = plan.installments?.[0]?.verification || {};
  check('B3 EMI list 200', r.status === 200, `status=${r.status}`);
  check('B3 EMI list drops slip evidence', ['paymentSlipUrl', 'requestedAmount', 'note', 'submittedAt', 'reviewedBy', 'reviewedAt', 'requestedDate'].every((k) => !(k in v0)), keys(v0).join(','));
  check('B3 EMI list keeps status+reviewNote+scalars', v0.status === 'pending' && v0.reviewNote === 'looks ok' && plan.installments?.[0]?.amount === 350000 && plan.installments?.[1]?.status === 'pending', JSON.stringify(v0));
  check('B3 EMI list keeps virtuals', plan.outstandingBalance != null && plan.nextDueInstallment?.dueDate != null, `out=${plan.outstandingBalance}`);
  r = await req('GET', '/emi-plans?limit=10', tFiling);
  const aplan = (r.json.plans || []).find((p) => String(p._id) === String(b3.plan._id)) || {};
  check('B3 EMI agent still money-blind', r.status === 200 && aplan.principalAmount == null && (aplan.installments || [])[0]?.amount == null, `keys=${keys(aplan)}`);
  r = await req('GET', '/emi-plans?limit=10', tBuyer);
  const bplan = (r.json.plans || []).find((p) => String(p._id) === String(b3.plan._id)) || {};
  check('B3 EMI buyer keeps amount+reviewNote', r.status === 200 && bplan.installments?.[0]?.amount === 350000 && bplan.installments?.[0]?.verification?.reviewNote === 'looks ok', `status=${r.status}`);
  r = await req('GET', `/emi-plans/${b3.plan._id}`, tAdmin);
  check('B3 EMI detail keeps slip (preview works)', r.status === 200 && r.json.plan?.installments?.[0]?.verification?.paymentSlipUrl === 'http://x/slip.jpg', `status=${r.status}`);

  // ---- B3.3 visits buyer/staff split ----
  r = await req('GET', '/visits/my-visits?limit=5', tBuyer);
  const mv = (r.json.visits || [])[0] || {};
  check('B3 my-visits drops address/city', r.status === 200 && !('address' in (mv.property || {})) && !('city' in (mv.property || {})), `prop=${JSON.stringify(mv.property)}`);
  check('B3 my-visits keeps agent email (D6)', mv.assignedAgent?.email != null && mv.assignedAgent?.name != null, JSON.stringify(mv.assignedAgent));
  r = await req('GET', `/visits/${f.visit._id}`, tBuyer);
  const bv = r.json.visit || {};
  check('B3 visit detail buyer minimal', r.status === 200 && !('requestedBy' in bv) && !('convertedLead' in bv) && !('internalNotes' in bv), `keys=${keys(bv)}`);
  check('B3 visit detail buyer property trimmed', keys(bv.property || {}).every((k) => ['_id', 'title', 'slug', 'media'].includes(k)), JSON.stringify(bv.property));
  r = await req('GET', `/visits/${f.visit._id}`, tAdmin);
  const av = r.json.visit || {};
  check('B3 visit detail admin full (staff unchanged)', r.status === 200 && av.requestedBy?.name != null && av.property?.listedBy != null, `keys=${keys(av)}`);

  // ---- B2 ordering regression (ordering code untouched by B3) ----
  const Visit = require('../models/Visit');
  const PRIORITY = { pending_agent_review: 0, confirmed: 1, completed: 2, rejected: 3, cancelled: 3 };
  const all = await Visit.find({}).select('_id status requestedSlot').lean();
  const expected = [...all].sort((a, b) => (PRIORITY[a.status] ?? 9) - (PRIORITY[b.status] ?? 9) || new Date(a.requestedSlot) - new Date(b.requestedSlot)).map((v) => String(v._id));
  const pages = [];
  for (const page of [1, 2, 3]) {
    r = await req('GET', `/visits?page=${page}&limit=10`, tAdmin);
    pages.push(...(r.json.visits || []).map((v) => String(v._id)));
  }
  check('B3 visits order parity re-run (B2 intact)', pages.length === expected.length && pages.every((id, i) => id === expected[i]), `got=${pages.length} want=${expected.length}`);
}

// ---- B4 fixtures: blog post (compat readers hit network, not fixtures,
// but the envelope shapes need live rows) ----
async function seedB4(f) {
  const BlogPost = require('../models/BlogPost');
  const blog = await BlogPost.create({
    title: 'Matrix Post', slug: 'matrix-post', body: 'hello world',
    author: f.admin._id, status: 'published',
  });
  return { blog };
}

async function runB4({ tAdmin, tFiling, tLead, tBuyer, f }) {
  const b4 = await seedB4(f);
  let r;

  // ---- B4.1 rental populate (additive; pair kept) ----
  r = await req('GET', '/commissions?limit=10', tAdmin);
  const rentalComm = (r.json.commissions || []).find((c) => c.rental && typeof c.rental === 'object') || {};
  const saleComm = (r.json.commissions || []).find((c) => c.sale && typeof c.sale === 'object') || null;
  check('B4 commissions 200', r.status === 200, `status=${r.status}`);
  check('B4 rental-origin populated', rentalComm.rental?.monthlyRent === 20000 && rentalComm.rental?.durationInMonths === 12 && rentalComm.rental?._id != null, JSON.stringify(rentalComm.rental)?.slice(0, 120));
  check('B4 sale-origin rental stays null (pair kept, no discriminator)', saleComm === null, `unexpected populated sale=${JSON.stringify(saleComm)?.slice(0, 80)}`);
  check('B4 totals intact', r.json.totals != null, '');

  // ---- B4.2 blog envelopes + compat ----
  r = await req('GET', '/blogs/published?limit=5', null);
  check('B4 blogs list envelope', r.status === 200 && r.json.success === true && Array.isArray(r.json.blogs) && r.json.pagination != null, `status=${r.status} keys=${Object.keys(r.json || {})}`);
  check('B4 list compat (data.blogs ?? [])', ((r.json.blogs ?? []).length) >= 1, '');
  r = await req('GET', `/blogs/slug/${b4.blog.slug}`, null);
  check('B4 slug single envelope', r.status === 200 && r.json.success === true && r.json.blog?.title === 'Matrix Post', `status=${r.status}`);
  check('B4 single compat (data.blog ?? data)', ((r.json.blog ?? r.json).title) === 'Matrix Post', '');
  r = await req('GET', `/blogs/${b4.blog._id}`, tAdmin);
  check('B4 admin by-id envelope', r.status === 200 && r.json.success === true && r.json.blog?._id != null, `status=${r.status}`);

  // ---- B4.3 search fix (was silently zero rows) ----
  r = await req('GET', `/conversations?isActive=all&search=${encodeURIComponent('LeadAg')}`, tAdmin);
  const foundA = (r.json.conversations || []).some((c) => c.owner?.name === 'LeadAg' || c.inquirer?.name === 'LeadAg');
  check('B4 admin search returns name matches (was zero)', r.status === 200 && foundA, `status=${r.status} n=${(r.json.conversations || []).length}`);
  r = await req('GET', '/conversations?isActive=all&search=zzz-no-such-name', tAdmin);
  check('B4 admin gibberish search empty (not everything)', r.status === 200 && (r.json.conversations || []).length === 0, `n=${(r.json.conversations || []).length}`);
  r = await req('GET', `/conversations/my-conversations?isActive=all&search=${encodeURIComponent('LeadAg')}`, tLead);
  check('B4 my-conversations server search works', r.status === 200 && (r.json.conversations || []).length >= 1, `status=${r.status} n=${(r.json.conversations || []).length}`);

  // ---- B4.4 pagination alias ----
  r = await req('GET', '/properties?limit=5', null);
  check('B4 dual envelope consistent', r.status === 200 && r.json.pagination?.total != null, `keys=${Object.keys(r.json || {})}`);

  // ---- B6.2 legacy keys removed; canonical pagination only ----
  check('B6 legacy total/page/pages absent', !('total' in (r.json || {})) && !('page' in (r.json || {})) && !('pages' in (r.json || {})), `keys=${Object.keys(r.json || {})}`);
  check('B6 canonical pagination complete', r.json.pagination?.page === 1 && r.json.pagination?.limit === 5 && typeof r.json.pagination?.total === 'number' && typeof r.json.pagination?.totalPages === 'number', JSON.stringify(r.json.pagination));
  check('B6 count retained', typeof r.json.count === 'number', '');
}

// ---- Lead follow-up overdue reminders (generator invoked in-process) ----
async function runLeadReminders({ f }) {
  const Lead = require('../models/Lead');
  const Notification = require('../models/Notification');
  const { runLeadFollowupReminders } = require('../utils/leadFollowupReminders');

  const yesterday = new Date(Date.now() - 864e5);
  const tomorrow = new Date(Date.now() + 864e5);
  const tag = Math.random().toString(36).slice(2);
  const mk = (over) => Lead.create({
    name: 'Rem', email: `rem-${tag}-${Math.random().toString(36).slice(2)}@t.co`,
    phone: '9800000003', property: f.property._id, ...over,
  });
  const assigned = await mk({ name: 'RemAssigned', assignedAgent: f.leadAgent._id, nextFollowUp: yesterday });
  const unassigned = await mk({ name: 'RemUnassigned', assignedAgent: null, nextFollowUp: yesterday });
  const future = await mk({ name: 'RemFuture', assignedAgent: f.leadAgent._id, nextFollowUp: tomorrow });
  const closed = await mk({ name: 'RemClosed', assignedAgent: f.leadAgent._id, nextFollowUp: yesterday, stage: 'closed' });
  const ids = [assigned._id, unassigned._id, future._id, closed._id];

  const out1 = await runLeadFollowupReminders();
  check('LR generator runs + sees both overdue leads', !!out1 && out1.overdueLeads === 2 && out1.notificationsCreated === 2, JSON.stringify(out1));
  const nAgent = await Notification.findOne({ recipient: f.leadAgent._id, type: 'lead_followup_due', lead: assigned._id }).lean();
  check('LR assignee notified with deep link', !!nAgent && nAgent.link === `/dashboard/lead-management/leads/${assigned._id}`, nAgent ? nAgent.link : 'none');
  const nAdmin = await Notification.findOne({ recipient: f.admin._id, type: 'lead_followup_due', lead: unassigned._id }).lean();
  check('LR unassigned lead alerts admin', !!nAdmin, 'none');
  check('LR future follow-up ignored', (await Notification.countDocuments({ type: 'lead_followup_due', lead: future._id })) === 0, '');
  check('LR closed lead ignored', (await Notification.countDocuments({ type: 'lead_followup_due', lead: closed._id })) === 0, '');

  const out2 = await runLeadFollowupReminders();
  check('LR re-run dedups (zero new)', !!out2 && out2.notificationsCreated === 0, JSON.stringify(out2));

  await Notification.deleteMany({ type: 'lead_followup_due', lead: { $in: ids } });
  await Lead.deleteMany({ _id: { $in: ids } });
}

// ---- Manual lead close (agents: lost yes, closed no) + referral backfill ----
async function runLeadClose({ tAdmin, tLead, f }) {
  const Lead = require('../models/Lead');
  const Notification = require('../models/Notification');
  const User = require('../models/User');
  const tag = Math.random().toString(36).slice(2);
  const mk = (over) => Lead.create({
    name: 'Close', email: `close-${tag}-${Math.random().toString(36).slice(2)}@t.co`,
    phone: '9800000003', property: f.property._id, assignedAgent: f.leadAgent._id, ...over,
  });
  let r;

  // Agent close rejected; agent lost allowed + notifies admins (no lead_closed)
  const agentLead = await mk({ name: 'CloseByAgent' });
  r = await req('PATCH', `/leads/${agentLead._id}/stage`, tLead, { stage: 'closed' });
  check('LC agent close rejected 403', r.status === 403, `status=${r.status}`);
  r = await req('PATCH', `/leads/${agentLead._id}/stage`, tLead, { stage: 'lost' });
  check('LC agent lost allowed 200', r.status === 200 && r.json.lead?.stage === 'lost', `status=${r.status}`);
  const nLostAdmin = await Notification.findOne({ recipient: f.admin._id, type: 'lead_stage_changed', lead: agentLead._id }).lean();
  check('LC agent lost notifies admin', !!nLostAdmin && /lost/i.test(nLostAdmin.message || ''), nLostAdmin ? nLostAdmin.message : 'none');
  check('LC lost sends no lead_closed', (await Notification.countDocuments({ type: 'lead_closed', lead: agentLead._id })) === 0, '');

  // Valid agent working-stage move still intact
  r = await req('PATCH', `/leads/${agentLead._id}/stage`, tLead, { stage: 'negotiation' });
  check('LC agent working-stage move intact', r.status === 200 && r.json.lead?.stage === 'negotiation', `status=${r.status}`);

  // Admin closes assigned lead -> agent notified, no generic duplicate
  const adminLead = await mk({ name: 'CloseByAdmin' });
  r = await req('PATCH', `/leads/${adminLead._id}/stage`, tAdmin, { stage: 'closed' });
  check('LC admin close 200', r.status === 200 && r.json.lead?.stage === 'closed', `status=${r.status}`);
  const nAgent = await Notification.findOne({ recipient: f.leadAgent._id, type: 'lead_closed', lead: adminLead._id }).lean();
  check('LC admin close notifies agent', !!nAgent, 'none');
  check('LC close sends no generic stage_changed', (await Notification.countDocuments({ type: 'lead_stage_changed', lead: adminLead._id })) === 0, '');

  // System stage stays protected for agents
  const sysLead = await mk({ name: 'CloseSys' });
  r = await req('PATCH', `/leads/${sysLead._id}/stage`, tLead, { stage: 'pending_verification' });
  check('LC agent pending_verification still 400', r.status === 400, `status=${r.status}`);

  // Referral: legacy account without a code gets one minted on session bootstrap
  const legacy = await User.create({
    name: 'Legacy', email: `legacy-${tag}@t.co`, password: 'password123',
    phone: '9800000001', isEmailVerified: true, verificationStatus: 'verified',
  });
  await User.updateOne({ _id: legacy._id }, { $unset: { referralCode: 1 } });
  const { generateToken } = require('../utils/generateToken');
  r = await req('GET', '/auth/me', generateToken(legacy._id, legacy.role));
  check('LC legacy user backfilled via me', r.status === 200 && typeof r.json.user?.referralCode === 'string' && r.json.user.referralCode.length > 0, `status=${r.status} code=${r.json.user?.referralCode}`);
  const fresh = await User.create({
    name: 'Fresh', email: `fresh-${tag}@t.co`, password: 'password123',
    phone: '9800000001', isEmailVerified: true, verificationStatus: 'verified',
  });
  check('LC new user auto-receives code', typeof fresh.referralCode === 'string' && fresh.referralCode.length > 0, String(fresh.referralCode));

  await Notification.deleteMany({ lead: { $in: [agentLead._id, adminLead._id, sysLead._id] } });
  await Lead.deleteMany({ _id: { $in: [agentLead._id, adminLead._id, sysLead._id] } });
  await User.deleteMany({ _id: { $in: [legacy._id, fresh._id] } });
}

// ---- Analytics export authorization boundary (CSV bodies are not JSON,
// so statuses go through req() and content through a raw text fetch) ----
async function runAnalyticsExport({ tAdmin, tLead }) {
  let r;
  r = await req('GET', '/analytics/export?type=admin&format=csv', tAdmin);
  check('AX admin type=admin 200', r.status === 200, `status=${r.status}`);
  r = await req('GET', '/analytics/export?type=admin&format=csv', tLead);
  check('AX agent type=admin 403', r.status === 403, `status=${r.status}`);
  r = await req('GET', '/analytics/export?type=agent&format=csv', tLead);
  check('AX agent type=agent 200', r.status === 200, `status=${r.status}`);
  r = await req('GET', '/analytics/export?type=agent&format=csv', null);
  check('AX anonymous 401', r.status === 401, `status=${r.status}`);

  const raw = async (url, token) => {
    const res = await fetch(`http://127.0.0.1:5057/api${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: res.status, text: await res.text() };
  };
  const agentCsv = await raw('/analytics/export?type=agent&format=csv', tLead);
  check('AX agent export self-scoped content', agentCsv.status === 200 && agentCsv.text.includes('Agent analytics report') && !agentCsv.text.includes('Admin analytics report'), `status=${agentCsv.status}`);
  const adminCsv = await raw('/analytics/export?type=admin&format=csv', tAdmin);
  check('AX admin export intact', adminCsv.status === 200 && adminCsv.text.includes('Admin analytics report'), `status=${adminCsv.status}`);
}

// ---- Slice A fixtures: property-management lifecycle ----
async function seedPM(f) {
  const User = require('../models/User');
  const Property = require('../models/Property');
  const ptype = (await Property.findById(f.property._id).select('propertyType').lean()).propertyType;
  const mkProp = (owner, i) => Property.create({
    title: `PM House ${i}`, description: 'seed body for pm', propertyType: ptype,
    price: 500000, listedBy: owner._id,
  });
  const ownerB = await User.create({
    name: 'OwnerB', email: 'ownerb@t.co', password: 'password123',
    isEmailVerified: true, verificationStatus: 'verified',
  });
  const agentX = await User.create({
    name: 'AgentX', email: 'agentx@t.co', password: 'password123', role: 'agent',
    isEmailVerified: true, verificationStatus: 'verified',
  });
  return { ownerB, agentX, mkProp };
}

async function runPM({ tAdmin, f }) {
  const T = (u) => generateToken(u._id, u.role);
  const pm = await seedPM(f);
  const tOwner = T(f.buyer); // buyer acts as property owner (owns B1/B2 props)
  const tOwnerB = T(pm.ownerB);
  const tAgentX = T(pm.agentX);
  const Property = require('../models/Property');
  const Notification = require('../models/Notification');
  let r;

  const p1 = await pm.mkProp(f.buyer, 1);
  // create: owner ok, non-owner forbidden, empty services rejected
  r = await req('POST', '/property-management', tOwnerB, { property: p1._id, services: ['rent_collection'] });
  check('PM non-owner create 403', r.status === 403, `status=${r.status}`);
  r = await req('POST', '/property-management', tOwner, { property: p1._id, services: [] });
  check('PM empty services 400', r.status === 400, `status=${r.status}`);
  r = await req('POST', '/property-management', tOwner, { property: p1._id, services: ['rent_collection'], note: 'hi' });
  check('PM create -> pending', r.status === 201 && r.json.request?.status === 'pending', `status=${r.status}`);
  const id1 = r.json.request._id;
  check('PM no assignedAgent anywhere', !('assignedAgent' in (r.json.request || {})), '');
  r = await req('POST', '/property-management', tOwner, { property: p1._id, services: ['rent_collection'] });
  check('PM duplicate live 409', r.status === 409, `status=${r.status}`);

  // accept: pending -> active, terminal
  r = await req('PATCH', `/property-management/${id1}/accept`, tAdmin);
  check('PM accept -> active + decider', r.status === 200 && r.json.request?.status === 'active' && r.json.request?.decidedBy != null && r.json.request?.decidedAt != null, `status=${r.status}`);
  const acts1 = (r.json.request?.activities || []).map((a) => a.type);
  check('PM accepted activity', acts1.includes('submitted') && acts1.includes('accepted'), acts1.join(','));
  r = await req('PATCH', `/property-management/${id1}/accept`, tAdmin);
  check('PM accept on active 409', r.status === 409, `status=${r.status}`);
  r = await req('PATCH', `/property-management/${id1}/decline`, tAdmin, { decisionReason: 'x' });
  check('PM decline on active 409', r.status === 409, `status=${r.status}`);
  // direct terminate requires reason; then terminal
  r = await req('PATCH', `/property-management/${id1}/terminate`, tAdmin, {});
  check('PM terminate w/o reason 400', r.status === 400, `status=${r.status}`);
  r = await req('PATCH', `/property-management/${id1}/terminate`, tAdmin, { terminatedReason: 'done' });
  check('PM terminate -> terminated', r.status === 200 && r.json.request?.status === 'terminated' && r.json.request?.terminatedReason === 'done' && r.json.request?.terminatedBy != null, `status=${r.status}`);
  r = await req('PATCH', `/property-management/${id1}/terminate`, tAdmin, { terminatedReason: 'again' });
  check('PM terminate on terminated 409', r.status === 409, `status=${r.status}`);
  // notification back-ref resolves (was silently dropped pre-fix)
  const n1 = await Notification.findOne({ propertyManagementRequest: id1 }).lean();
  check('PM notify back-ref stored', !!n1, '');

  // decline flow on fresh property + re-file allowed
  const p2 = await pm.mkProp(f.buyer, 2);
  r = await req('POST', '/property-management', tOwner, { property: p2._id, services: ['rent_collection'] });
  const id2 = r.json.request._id;
  r = await req('PATCH', `/property-management/${id2}/decline`, tAdmin, {});
  check('PM decline w/o reason 400', r.status === 400, `status=${r.status}`);
  r = await req('PATCH', `/property-management/${id2}/decline`, tAdmin, { decisionReason: 'nope' });
  check('PM decline -> declined', r.status === 200 && r.json.request?.status === 'declined' && r.json.request?.decisionReason === 'nope', `status=${r.status}`);
  r = await req('PATCH', `/property-management/${id2}/accept`, tAdmin);
  check('PM accept on declined 409 (terminal)', r.status === 409, `status=${r.status}`);
  r = await req('POST', '/property-management', tOwner, { property: p2._id, services: ['rent_collection'] });
  check('PM re-file after declined allowed', r.status === 201, `status=${r.status}`);

  // termination-request flow on fresh property
  const p3 = await pm.mkProp(f.buyer, 3);
  r = await req('POST', '/property-management', tOwner, { property: p3._id, services: ['rent_collection'] });
  const id3 = r.json.request._id;
  r = await req('PATCH', `/property-management/${id3}/request-termination`, tOwner, {});
  check('PM pending -> termination_pending rejected', r.status === 409, `status=${r.status}`);
  await req('PATCH', `/property-management/${id3}/accept`, tAdmin);
  r = await req('PATCH', `/property-management/${id3}/request-termination`, tOwner, {});
  check('PM owner termination (no reason) -> termination_pending', r.status === 200 && r.json.request?.status === 'termination_pending' && r.json.request?.terminationRequestedAt != null, `status=${r.status}`);
  r = await req('PATCH', `/property-management/${id3}/terminate`, tAdmin, { terminatedReason: 'direct' });
  check('PM direct terminate from termination_pending 409 (forbidden path)', r.status === 409, `status=${r.status}`);
  r = await req('PATCH', `/property-management/${id3}/request-termination`, tOwner, { terminationReason: 'x' });
  check('PM second termination request 409', r.status === 409, `status=${r.status}`);
  r = await req('PATCH', `/property-management/${id3}/approve-termination`, tAdmin);
  check('PM approve-termination -> terminated', r.status === 200 && r.json.request?.status === 'terminated' && r.json.request?.terminatedBy != null, `status=${r.status}`);
  const acts3 = (r.json.request?.activities || []).map((a) => a.type);
  check('PM termination_requested+terminated activities', acts3.includes('termination_requested') && acts3.includes('terminated'), acts3.join(','));

  // auth: other owner + agent + anon
  const p4 = await pm.mkProp(f.buyer, 4);
  r = await req('POST', '/property-management', tOwner, { property: p4._id, services: ['rent_collection'] });
  const id4 = r.json.request._id;
  r = await req('GET', `/property-management/${id4}`, tOwnerB);
  check('PM other owner detail 403', r.status === 403, `status=${r.status}`);
  r = await req('GET', `/property-management/${id4}`, tAgentX);
  check('PM agent detail 403 (no agent role)', r.status === 403, `status=${r.status}`);
  r = await req('PATCH', `/property-management/${id4}/request-termination`, tOwnerB, {});
  check('PM other owner termination 403', r.status === 403, `status=${r.status}`);
  r = await req('PATCH', `/property-management/${id4}/accept`, tOwner, {});
  check('PM owner accept 403 (admin only)', r.status === 403, `status=${r.status}`);
  r = await req('GET', '/property-management', tOwner);
  check('PM admin list forbidden for owner', r.status === 403, `status=${r.status}`);
}

main().catch(async (e) => { console.error('MATRIX ERROR:', e.message); process.exit(2); });
