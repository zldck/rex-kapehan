export function isPaymentIntentPaid(status) {
  return status === 'succeeded';
}

export function isPaymentIntentSafelyReleasable(status) {
  return status === 'canceled';
}