const { randomUUID } = require('node:crypto');
const { getPayment, savePayment } = require('../store/paymentStore');

const PAYMENT_STATUSES = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  SUCCESS: 'Success',
  FAILED: 'Failed',
};
const PROCESSING_COMPLETION_DELAY_MS = 20;
const RETRY_BASE_DELAY_MS = 25;
const DEFAULT_MAX_PROCESSING_ATTEMPTS = 3;
const parsedMaxProcessingAttempts = Number.parseInt(process.env.PAYMENT_MAX_RETRY_ATTEMPTS ?? '', 10);
const MAX_PROCESSING_ATTEMPTS = Number.isInteger(parsedMaxProcessingAttempts) && parsedMaxProcessingAttempts > 0
  ? parsedMaxProcessingAttempts
  : DEFAULT_MAX_PROCESSING_ATTEMPTS;

function createPayment({ amount, currency, reference }) {
  const now = new Date().toISOString();
  const payment = {
    id: randomUUID(),
    amount,
    currency,
    reference,
    status: PAYMENT_STATUSES.PENDING,
    processingAttempts: 0,
    retryCount: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  return savePayment(payment);
}

function scheduleRetry(id, nextAttempt, options) {
  const retryDelay = RETRY_BASE_DELAY_MS * (2 ** (nextAttempt - 1));
  setTimeout(() => {
    runProcessingAttempt(id, nextAttempt, options);
  }, retryDelay);
}

function runProcessingAttempt(id, attempt, { shouldSucceed = true, failuresBeforeSuccess = 0 } = {}) {
  setTimeout(() => {
    try {
      const latestPayment = getPayment(id);
      if (!latestPayment || latestPayment.status !== PAYMENT_STATUSES.PROCESSING) {
        return;
      }

      latestPayment.processingAttempts += 1;
      latestPayment.updatedAt = new Date().toISOString();

      const wasSuccessful = shouldSucceed && attempt > failuresBeforeSuccess;

      if (wasSuccessful) {
        latestPayment.status = PAYMENT_STATUSES.SUCCESS;
        latestPayment.lastError = null;
        savePayment(latestPayment);
        return;
      }

      latestPayment.lastError = `Gateway processing failed on attempt ${attempt}.`;

      if (attempt < MAX_PROCESSING_ATTEMPTS) {
        latestPayment.retryCount += 1;
        savePayment(latestPayment);
        scheduleRetry(id, attempt + 1, { shouldSucceed, failuresBeforeSuccess });
        return;
      }

      latestPayment.status = PAYMENT_STATUSES.FAILED;
      savePayment(latestPayment);
    } catch (error) {
      console.error('Failed to process payment attempt.', {
        paymentId: id,
        attempt,
        error,
      });
    }
  }, PROCESSING_COMPLETION_DELAY_MS);
}

function processPayment(id, { shouldSucceed = true, failuresBeforeSuccess = 0 } = {}) {
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

  runProcessingAttempt(id, 1, { shouldSucceed, failuresBeforeSuccess });

  return payment;
}

function getPaymentById(id) {
  return getPayment(id);
}

module.exports = {
  PAYMENT_STATUSES,
  PROCESSING_COMPLETION_DELAY_MS,
  RETRY_BASE_DELAY_MS,
  MAX_PROCESSING_ATTEMPTS,
  createPayment,
  processPayment,
  getPaymentById,
};
