// Phase 4: unit tests for HeroSlide read-time helpers (pure functions).
// Run: node --test tests/hero-slide-helpers.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  effectiveState,
  isScheduleEligible,
  toPublicSlide,
} = require('../utils/heroSlideMedia');

describe('heroSlideMedia helpers', () => {
  const now = new Date('2026-09-18T12:00:00Z');
  const past = new Date('2026-09-10T12:00:00Z');
  const future = new Date('2026-09-25T12:00:00Z');

  it('derives draft/scheduled/active/expired without stored flags', () => {
    assert.equal(effectiveState({ status: 'draft' }, now), 'draft');
    assert.equal(effectiveState({ status: 'published', startAt: future }, now), 'scheduled');
    assert.equal(effectiveState({ status: 'published' }, now), 'active');
    assert.equal(
      effectiveState({ status: 'published', startAt: past, endAt: future }, now),
      'active'
    );
    assert.equal(effectiveState({ status: 'published', endAt: past }, now), 'expired');
    // Boundary instants count as eligible (inclusive <= / >=).
    assert.equal(effectiveState({ status: 'published', startAt: now, endAt: now }, now), 'active');
  });

  it('schedule eligibility matches the public query semantics', () => {
    assert.equal(isScheduleEligible({ status: 'published' }, now), true);
    assert.equal(isScheduleEligible({ status: 'draft' }, now), false);
    assert.equal(isScheduleEligible({ status: 'published', startAt: future }, now), false);
    assert.equal(isScheduleEligible({ status: 'published', endAt: past }, now), false);
  });

  it('public DTO strips Cloudinary identifiers and audit fields', () => {
    const dto = toPublicSlide({
      _id: 'abc123',
      title: 'T',
      subtitle: 'S',
      description: 'D',
      media: {
        type: 'video',
        url: 'https://res.cloudinary.com/x/video/upload/v1/hero.mp4',
        thumbnailUrl: 'https://res.cloudinary.com/x/image/upload/v1/thumb.jpg',
        thumbnailPublicId: 'should-not-leak',
        altText: 'alt',
      },
      cta: { enabled: true, label: 'Go', actionType: 'url', actionValue: 'https://example.com' },
      displayOrder: 2,
      duration: 7,
      createdBy: 'admin-id',
      updatedBy: 'admin-id',
    });
    assert.equal(dto.media.publicId, undefined);
    assert.equal(dto.media.thumbnailPublicId, undefined);
    assert.equal(dto.createdBy, undefined);
    assert.equal(dto.updatedBy, undefined);
    assert.equal(dto.media.type, 'video');
    assert.equal(dto.cta.actionValue, 'https://example.com');
    assert.equal(dto.duration, 7);
  });
});
