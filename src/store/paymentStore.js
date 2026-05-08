const payments = new Map();
const idempotencyIndex = new Map();
const callbackEventIndex = new Map();

function savePayment(payment) {
  payments.set(payment.id, payment);
  if (payment.idempotencyKey) {
    idempotencyIndex.set(payment.idempotencyKey, payment.id);
  }
  return payment;
}

function getPayment(id) {
  return payments.get(id) ?? null;
}

function getPaymentByIdempotencyKey(idempotencyKey) {
  const paymentId = idempotencyIndex.get(idempotencyKey);
  if (!paymentId) {
    return null;
  }

  return getPayment(paymentId);
}

function recordCallbackEvent(paymentId, eventId) {
  if (!eventId) {
    return true;
  }

  if (!callbackEventIndex.has(paymentId)) {
    callbackEventIndex.set(paymentId, new Set());
  }

  const seenEvents = callbackEventIndex.get(paymentId);
  if (seenEvents.has(eventId)) {
    return false;
  }

  seenEvents.add(eventId);
  return true;
}

function clearPayments() {
  payments.clear();
  idempotencyIndex.clear();
  callbackEventIndex.clear();
}

module.exports = {
  savePayment,
  getPayment,
  getPaymentByIdempotencyKey,
  recordCallbackEvent,
  clearPayments,
};
