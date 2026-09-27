export function normalizeDurationMinutes(durationMinutes) {
  const minutes = Number(durationMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return 60;
  return minutes === 30 ? 30 : 60;
}

export function generateDefaultAvailableSlots(includeHalfHour = false) {
  const slots = [];

  for (let minutes = 0; minutes < 24 * 60; minutes += includeHalfHour ? 30 : 60) {
    const hour = Math.floor(minutes / 60) % 24;
    const minute = minutes % 60;
    const hour12 = hour % 12 || 12;
    const suffix = hour < 12 ? 'AM' : 'PM';
    slots.push(`${hour12}:${String(minute).padStart(2, '0')} ${suffix}`);
  }

  return slots;
}

export function computeBookingTotalCents(hourlyRate, slotCount, durationMinutes = 60) {
  const safeRate = Number(hourlyRate) || 0;
  const safeSlots = Number(slotCount) || 0;
  const safeDuration = normalizeDurationMinutes(durationMinutes);

  return Math.round((safeSlots * safeRate * safeDuration / 60) * 100);
}
