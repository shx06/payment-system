const payments = new Map();
const paymentLocks = new Set();

function savePayment(payment) {
  payments.set(payment.id, payment);
  return payment;
}

function getPayment(id) {
  return payments.get(id) ?? null;
}

function deletePayment(id) {
  payments.delete(id);
}

function listPayments() {
  return Array.from(payments.values());
}

function clearPayments() {
  payments.clear();
}

function acquirePaymentLock(paymentId) {
  if (paymentLocks.has(paymentId)) {
    return false;
  }

  paymentLocks.add(paymentId);
  return true;
}

function releasePaymentLock(paymentId) {
  paymentLocks.delete(paymentId);
}

function clearPaymentLocks() {
  paymentLocks.clear();
}

module.exports = {
  savePayment,
  getPayment,
  deletePayment,
  listPayments,
  clearPayments,
  acquirePaymentLock,
  releasePaymentLock,
  clearPaymentLocks,
};
