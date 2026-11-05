import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consentedAtAfterAccountCreation } from '../src/auth/consent.js';

test('explicit consent timestamps remain later than account creation within one clock millisecond', () => {
  const createdAt = '2026-11-05T12:00:00.000Z';
  assert.equal(consentedAtAfterAccountCreation(createdAt, new Date(createdAt)), '2026-11-05T12:00:00.001Z');
  assert.equal(consentedAtAfterAccountCreation(createdAt, new Date('2026-11-05T12:00:00.001Z')), '2026-11-05T12:00:00.001Z');
});
