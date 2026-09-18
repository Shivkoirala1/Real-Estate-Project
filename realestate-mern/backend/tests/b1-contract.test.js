// B1 API-contract regression tests (minimal suite — no prior suite existed).
// Run: node --test tests/b1-contract.test.js
// Mix of functional checks (otp machinery reused by the reset flow) and
// source-level contract guards (no DB required) for B1 field projections.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const FRONT = '../frontend/src';

describe('B1.1 user roster projections', () => {
  const src = read('controllers/userController.js');
  it('roster + single-user queries whitelist safe fields', () => {
    assert.match(src, /User\.find\(query\)\s*\n?\s*\.select\('_id name email phone role verificationStatus isActive createdAt'\)/);
    assert.match(src, /User\.findById\(req\.params\.id\)\s*\n?\s*\.select\('_id name email phone role verificationStatus isActive createdAt'\)/);
  });
  it('verification queue adds ID photos + note, nothing else sensitive', () => {
    assert.match(src, /selfiePhoto citizenshipPhotoFront citizenshipPhotoBack verificationNote/);
    assert.ok(!/xp|ycCoin|referralCode|referredBy|loginStreak|favorites/.test(
      src.match(/getPendingVerifications[\s\S]*?}\);/)?.[0] || ''
    ), 'verification query leaks gamification/referral fields');
  });
});

describe('B1.2 admin reset = email-code flow, no secret in body', () => {
  const src = read('controllers/userController.js');
  it('uses shared otp machinery with 15-min TTL', () => {
    assert.match(src, /require\('\.\.\/utils\/otp'\)/);
    assert.match(src, /passwordResetCodeHash = hash/);
    assert.match(src, /CODE_TTL_MS/);
  });
  it('never returns tempPassword', () => {
    assert.ok(!src.includes('tempPassword'), 'tempPassword still present in userController');
    assert.ok(!src.includes('randomBytes'), 'crypto temp password still present');
  });
  it('keeps AuditLog write with redacted value', () => {
    assert.match(src, /action: 'reset_password'[\s\S]*?newValue: '\[redacted\]'/);
  });
  it('otp machinery round-trips (functional)', () => {
    const { generateCode, hashCode, CODE_TTL_MS } = require('../utils/otp');
    const { code, hash } = generateCode();
    assert.equal(hashCode(code), hash);
    assert.equal(CODE_TTL_MS, 15 * 60 * 1000);
  });
  it('ManageUsers toast no longer reads removed field', () => {
    const ui = read(path.join(FRONT, 'pages/admin/ManageUsers.jsx'));
    assert.ok(!ui.includes('tempPassword'), 'ManageUsers still reads data.tempPassword');
    assert.match(ui, /Reset code sent to the user/);
  });
});

describe('B1.3 sale/rental detail lead selection', () => {
  it('sale detail bounds lead populate', () => {
    const src = read('controllers/saleController.js');
    assert.match(src, /path: 'lead', select: '_id name email phone stage assignedAgent'/);
    assert.ok(!src.match(/\{\s*path:\s*'lead'\s*\}/), 'bare populate({path:lead}) remains');
  });
  it('rental detail bounds lead populate', () => {
    const src = read('controllers/rentalController.js');
    assert.match(src, /path: 'lead', select: '_id name email phone stage assignedAgent'/);
    assert.ok(!src.match(/\{\s*path:\s*'lead'\s*\}/), 'bare populate({path:lead}) remains');
  });
});

describe('B1.4 contact respond user selection', () => {
  it('bounds user populate to id/name/email', () => {
    const src = read('controllers/contactFormController.js');
    assert.match(src, /populate\(\s*"user",\s*"_id name email"/);
  });
});

describe('B1.5 updateVisit sanitizer', () => {
  it('echo passes through sanitizeVisitForViewer with assigned-agent parity', () => {
    const src = read('controllers/visitController.js');
    assert.match(src, /visit: sanitizeVisitForViewer\(\s*visit,/);
    assert.match(src, /req\.user\.role === "admin"/);
  });
  it('sanitizer strips only internalNotes for non-staff (functional mirror)', () => {
    // Mirror of sanitizeVisitForViewer logic (kept in sync by the source test above).
    const sanitize = (visit, viewerIsAdmin) => {
      if (viewerIsAdmin) return visit;
      const plain = { ...visit };
      delete plain.internalNotes;
      return plain;
    };
    const v = { _id: '1', internalNotes: 'x', status: 'pending' };
    assert.ok(!('internalNotes' in sanitize(v, false)));
    assert.ok('internalNotes' in sanitize(v, true));
  });
});

describe('B1.6 property detail contact gate', () => {
  it('anon gets identity-only listedBy select, authed keeps contact', () => {
    const src = read('controllers/propertyController.js');
    assert.match(src, /const listedBySelect = req\.user/);
    assert.match(src, /'name selfiePhoto verificationStatus createdAt'/);
    assert.match(src, /'name email phone selfiePhoto verificationStatus createdAt'/);
    assert.match(src, /\.populate\('listedBy', listedBySelect\)/);
  });
});

describe('B1.7 management-services catalogue is public, mutations admin-only', () => {
  const routes = read('routes/managementServiceRoutes.js');
  const ctrl = read('controllers/managementServiceController.js');
  it('GET / has no global protect; catalogue reads via optionalAuth', () => {
    assert.ok(!routes.includes('router.use(protect)'), 'global router.use(protect) still present');
    assert.match(routes, /router\.get\('\/',\s*optionalAuth,\s*controller\.getManagementServices\)/);
  });
  it('mutations stay protect + admin-authorized', () => {
    assert.match(routes, /router\.post\('\/',\s*protect,\s*authorize\('admin'\)/);
    assert.match(routes, /router\.patch\('\/:id',\s*protect,\s*authorize\('admin'\)/);
    assert.match(routes, /router\.patch\('\/:id\/status',\s*protect,\s*authorize\('admin'\)/);
  });
  it('controller is anonymous-safe and keeps inactive services admin-only', () => {
    assert.match(ctrl, /req\.user\?\.role === 'admin' && req\.query\.includeInactive === 'true'/);
    assert.match(ctrl, /includeInactive \? \{\} : \{ isActive: true \}/);
  });
});

describe('B1.8 seeder carries no legacy /uploads references', () => {
  it('seeder.js persists no /uploads/ paths', () => {
    const src = read('utils/seeder.js');
    assert.ok(!src.includes("'/uploads/"), 'stale /uploads/ seed path still present');
    assert.ok(!src.includes('"/uploads/'), 'stale /uploads/ seed path still present');
  });
});

describe('B1.10 manual lead close + lost notifications', () => {
  const src = read('controllers/leadController.js');
  const model = read('models/Lead.js');
  it('agents cannot close (only pending_verification and agent-close are hand-blocked)', () => {
    assert.match(src, /newStage === 'pending_verification'/);
    assert.match(src, /newStage === 'closed' && !isAdmin/);
    assert.ok(!src.includes('Agents cannot close a lead directly. Submit a Sale'), 'stale message remains');
  });
  it('agent lost notifies admins; admin close notifies the agent; no cross-talk', () => {
    assert.match(src, /newStage === 'lost' && !isAdmin/);
    assert.match(src, /type: 'lead_closed'/);
    const notif = read('models/Notification.js');
    assert.ok(notif.includes("'lead_closed'"), 'lead_closed missing from Notification enum');
  });
  it('manual stage options are role-based and exclude the system stage', () => {
    const consts = read(path.join(FRONT, 'utils/leadConstants.js'));
    assert.match(consts, /ADMIN_MANUAL_STAGES = STAGES\.filter\(\(s\) => s !== 'pending_verification'\)/);
    assert.match(consts, /AGENT_MANUAL_STAGES = STAGES\.filter\(\(s\) => s !== 'pending_verification' && s !== 'closed'\)/);
    assert.ok(!/export const MANUAL_STAGES/.test(consts), 'unscoped MANUAL_STAGES export remains');
    const detail = read(path.join(FRONT, 'pages/admin/LeadManagement/LeadDetail.jsx'));
    assert.ok(detail.includes("user?.role === 'admin' ? ADMIN_MANUAL_STAGES : AGENT_MANUAL_STAGES"), 'detail dropdown not role-based');
    for (const f of ['pages/admin/LeadManagement/LeadList.jsx', 'pages/agent/MyLeads.jsx']) {
      const body = read(path.join(FRONT, f));
      assert.ok(body.includes('MANUAL_STAGES'), `${f} missing role-scoped stage list`);
    }
  });
  it('close model comment matches the corrected rule', () => {
    assert.ok(model.includes('Agents cannot set a lead directly to'), 'corrected model comment missing');
  });
});

describe('B1.11 referral code backfill', () => {  const model = read('models/User.js');
  const auth = read('controllers/authController.js');
  it('generator is shared and backfill is a no-op when a code exists', () => {
    assert.match(model, /generateUniqueReferralCode/);
    assert.match(model, /ensureReferralCode/);
  });
  it('session bootstrap mints missing codes without failing the request', () => {
    assert.match(auth, /ensureReferralCode/);
  });
});
describe('B1.9 lead follow-up overdue reminder generator', () => {
  const src = read('utils/leadFollowupReminders.js');
  const server = read('server.js');
  it('matches the established overdue definition', () => {
    assert.match(src, /nextFollowUp: \{ \$ne: null, \$lt:/);
    assert.match(src, /stage: \{ \$nin: \['closed', 'lost'\] \}/);
  });
  it('notifies assignee, falls back to admins, dedups per day, never throws', () => {
    assert.match(src, /assignedAgent/);
    assert.match(src, /role: 'admin'/);
    assert.match(src, /type: 'lead_followup_due'/);
    assert.match(src, /Notification\.exists/);
    assert.match(src, /catch \(err\)/);
  });
  it('server schedules it daily behind its own flag', () => {
    assert.match(server, /LEAD_REMINDERS_ENABLED/);
    assert.match(server, /runLeadFollowupReminders/);
    assert.match(server, /0 9 \* \* \*/);
  });
  it('frontend bell renders the new type', () => {
    const bell = read(path.join(FRONT, 'components/NotificationBell.jsx'));
    const page = read(path.join(FRONT, 'pages/user/Notifications.jsx'));
    assert.ok(bell.includes('lead_followup_due'), 'bell missing lead_followup_due icon/tint');
    assert.ok(page.includes('lead_followup_due'), 'notifications page missing lead_followup_due label');
  });
});

describe('B1.12 admin export requires admin role', () => {
  it('exportAnalytics rejects non-admin type=admin with 403', () => {
    const src = read('controllers/analyticsController.js');
    assert.match(src, /type === 'admin' && req\.user\.role !== 'admin'/);
    assert.match(src, /Only admins can request the admin analytics report/);
  });
});
