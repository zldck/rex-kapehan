import test from 'node:test';
import assert from 'node:assert/strict';

import { computeBookingTotalCents, generateDefaultAvailableSlots } from '../app/lib/booking-pricing.js';

test('hourly booking charges the full hourly rate', () => {
  assert.equal(computeBookingTotalCents(350, 2, 60), 70000);
});

test('30-minute booking charges half the hourly rate per selected slot', () => {
  assert.equal(computeBookingTotalCents(350, 1, 30), 17500);
  assert.equal(computeBookingTotalCents(350, 3, 30), 52500);
});

test('half-hour generation includes 30-minute time entries across the full day', () => {
  const slots = generateDefaultAvailableSlots(true);
  assert.ok(slots.includes('8:30 AM'));
  assert.ok(slots.includes('9:00 PM'));
  assert.ok(slots.includes('12:00 AM'));
  assert.ok(slots.includes('11:30 PM'));
  assert.equal(slots.length, 48);
});
