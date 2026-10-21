import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isPaymentIntentPaid,
  isPaymentIntentSafelyReleasable,
} from '../app/lib/payment-intent-status.js';

test('only a succeeded Payment Intent is treated as paid', () => {
  assert.equal(isPaymentIntentPaid('succeeded'), true);
  assert.equal(isPaymentIntentPaid('processing'), false);
  assert.equal(isPaymentIntentPaid('awaiting_next_action'), false);
  assert.equal(isPaymentIntentPaid(undefined), false);
});

test('only an explicitly canceled Payment Intent can release a hold', () => {
  assert.equal(isPaymentIntentSafelyReleasable('canceled'), true);
  assert.equal(isPaymentIntentSafelyReleasable('awaiting_next_action'), false);
  assert.equal(isPaymentIntentSafelyReleasable('processing'), false);
  assert.equal(isPaymentIntentSafelyReleasable(undefined), false);
});