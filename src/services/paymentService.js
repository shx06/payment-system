const { randomUUID } = require('node:crypto');
const { getPayment, savePayment } = require('../store/paymentStore');

const PAYMENT_STATUSES = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  SUCCESS: 'Success',
  FAILED: 'Failed',
};

function createPayment({ amount, currency, reference }) {
  const now = new Date().toISOString();
  const payment = {
    id: randomUUID(),
    amount,
    currency,
    reference,
    status: PAYMENT_STATUSES.PENDING,
    createdAt: now,
    updatedAt: now,
  };

  return savePayment(payment);
}

function processPayment(id, { shouldSucceed = true } = {}) {
  const payment = getPayment(id);

  if (!payment) {
    const error = new Error('Payment not found.');
    error.statusCode = 404;
    throw error;
  }

  if (payment.status === PAYMENT_STATUSES.SUCCESS || payment.status === PAYMENT_STATUSES.FAILED) {
    const error = new Error('Payment is already in a terminal state.');
    error.statusCode = 409;
    throw error;
  }

  payment.status = PAYMENT_STATUSES.PROCESSING;
  payment.updatedAt = new Date().toISOString();

  payment.status = shouldSucceed ? PAYMENT_STATUSES.SUCCESS : PAYMENT_STATUSES.FAILED;
  payment.updatedAt = new Date().toISOString();

  return savePayment(payment);
}

function getPaymentById(id) {
  return getPayment(id);
}

module.exports = {
  PAYMENT_STATUSES,
  createPayment,
  processPayment,
  getPaymentById,
};
