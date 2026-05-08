const { randomUUID } = require('node:crypto');
const { getPayment, savePayment } = require('../store/paymentStore');

const PAYMENT_STATUSES = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  SUCCESS: 'Success',
  FAILED: 'Failed',
};
const PROCESSING_COMPLETION_DELAY_MS = 50;

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

  if (payment.status !== PAYMENT_STATUSES.PENDING) {
    const error = new Error('Payment cannot be processed from its current state.');
    error.statusCode = 409;
    throw error;
  }

  payment.status = PAYMENT_STATUSES.PROCESSING;
  payment.updatedAt = new Date().toISOString();
  savePayment(payment);

  setTimeout(() => {
    try {
      const latestPayment = getPayment(id);
      if (!latestPayment || latestPayment.status !== PAYMENT_STATUSES.PROCESSING) {
        return;
      }

      latestPayment.status = shouldSucceed ? PAYMENT_STATUSES.SUCCESS : PAYMENT_STATUSES.FAILED;
      latestPayment.updatedAt = new Date().toISOString();
      savePayment(latestPayment);
    } catch (error) {
      console.error('Failed to finalize payment processing.', error);
    }
  }, PROCESSING_COMPLETION_DELAY_MS);

  return payment;
}

function getPaymentById(id) {
  return getPayment(id);
}

module.exports = {
  PAYMENT_STATUSES,
  PROCESSING_COMPLETION_DELAY_MS,
  createPayment,
  processPayment,
  getPaymentById,
};
