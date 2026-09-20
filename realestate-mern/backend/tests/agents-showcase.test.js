// Agent showcase tests (no DB required).
// Run: node --test tests/agents-showcase.test.js
// Covers the About-page spotlight: isShowcased flag, admin toggle, and the
// public listing endpoint (field whitelist + active-only filter).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const User = require('../models/User');

describe('agent showcase flag', () => {
  it('User schema carries isShowcased defaulting to false', () => {
    const pathType = User.schema.path('isShowcased');
    assert.ok(pathType, 'isShowcased missing from User schema');
    assert.equal(pathType.instance, 'Boolean');
    assert.equal(pathType.options.default, false);
  });
});

describe('showcase routes', () => {
  const src = read('routes/agentRoutes.js');

  it('exposes a public showcased listing before the auth blanket', () => {
    const showcasedAt = src.indexOf("router.get('/showcased'");
    const protectAt = src.indexOf("router.all('*', protect)");
    assert.ok(showcasedAt !== -1, 'public /showcased route missing');
    assert.ok(protectAt !== -1, 'protect blanket missing');
    assert.ok(showcasedAt < protectAt, '/showcased must be registered before protect to stay public');
  });

  it('adds an admin-only showcase toggle mirroring the status toggle', () => {
    assert.match(src, /router\.patch\('\/:id\/showcase',\s*authorize\('admin'\),\s*toggleAgentShowcase\)/);
  });
});

describe('showcase controller', () => {
  const src = read('controllers/agentController.js');

  it('public listing filters to active showcased agents with safe fields only', () => {
    assert.match(src, /role:\s*'agent',\s*isActive:\s*true,\s*isShowcased:\s*true/);
    assert.match(src, /\.select\('_id name avatar phone'\)/);
    assert.ok(!src.match(/getShowcasedAgents[\s\S]{0,600}?performance/i), 'public listing must not leak performance stats');
  });

  it('toggle flips the flag on agent documents only', () => {
    assert.match(src, /user\.isShowcased = !user\.isShowcased/);
    assert.match(src, /const toggleAgentShowcase = asyncHandler\(async \(req, res\) => \{[\s\S]*?findAgentOr404/);
  });

  it('exports both new handlers', () => {
    assert.match(src, /getShowcasedAgents,/);
    assert.match(src, /toggleAgentShowcase,/);
  });
});

describe('agent service surface', () => {
  const src = read('../frontend/src/services/agentService.js');
  it('exposes showcased listing and toggle helpers', () => {
    assert.match(src, /\/agents\/showcased/);
    assert.match(src, /\/agents\/\$\{id\}\/showcase/);
  });
});
