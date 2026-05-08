const { randomUUID } = require('node:crypto');
const {
  getPayment,
  savePayment,
  getPaymentByIdempotencyKey,
  recordCallbackEvent,
} = require('../store/paymentStore');

const PAYMENT_STATUSES = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  SUCCESS: 'Success',
  FAILED: 'Failed',
};
const PROCESSING_COMPLETION_DELAY_MS = 50;
const EXTERNAL_GATEWAY_TIMEOUT_MS = 40;
const MAX_PROCESSING_ATTEMPTS = 3;
const RETRY_BACKOFF_BASE_MS = 25;
const CALLBACK_FINAL_STATUSES = new Set([PAYMENT_STATUSES.SUCCESS, PAYMENT_STATUSES.FAILED]);

function createPayment({ amount, currency, reference, idempotencyKey }) {
  if (idempotencyKey) {
    const existingPayment = getPaymentByIdempotencyKey(idempotencyKey);
    if (existingPayment) {
      return { payment: existingPayment, isIdempotentReplay: true };
    }
  }

  const now = new Date().toISOString();
  const payment = {
    id: randomUUID(),
    amount,
    currency,
    reference,
    idempotencyKey,
    status: PAYMENT_STATUSES.PENDING,
    processingAttempts: 0,
    createdAt: now,
    updatedAt: now,
  };

  return { payment: savePayment(payment), isIdempotentReplay: false };
}

function simulateExternalGateway({ shouldSucceed }) {
  const randomValue = Math.random();
  const outcome = typeof shouldSucceed === 'boolean'
    ? shouldSucceed ? 'success' : 'failure'
    : randomValue < 0.2
      ? 'timeout'
      : randomValue < 0.6
        ? 'failure'
        : 'success';

  const delayMs = 10 + Math.floor(Math.random() * 10);

  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error('External gateway timeout.'));
    }, EXTERNAL_GATEWAY_TIMEOUT_MS);

    setTimeout(() => {
      clearTimeout(timeoutHandle);

      if (outcome === 'success') {
        resolve({ status: PAYMENT_STATUSES.SUCCESS });
        return;
      }

      if (outcome === 'failure') {
        resolve({ status: PAYMENT_STATUSES.FAILED });
        return;
      }

      reject(new Error('External gateway timeout.'));
    }, delayMs);
  });
}

function scheduleRetry(id, payload, attempt) {
  const delay = RETRY_BACKOFF_BASE_MS * (2 ** (attempt - 1));
  setTimeout(() => {
    finalizePaymentAttempt(id, payload, attempt + 1);
  }, delay);
}

function finalizePaymentAttempt(id, payload, attempt) {
  const payment = getPayment(id);
  if (!payment || payment.status !== PAYMENT_STATUSES.PROCESSING) {
    return;
  }

  payment.processingAttempts = attempt;
  payment.updatedAt = new Date().toISOString();
  savePayment(payment);

  simulateExternalGateway(payload)
    .then((gatewayResult) => {
      const latestPayment = getPayment(id);
      if (!latestPayment || latestPayment.status !== PAYMENT_STATUSES.PROCESSING) {
        return;
      }

      if (gatewayResult.status === PAYMENT_STATUSES.SUCCESS) {
        latestPayment.status = PAYMENT_STATUSES.SUCCESS;
        latestPayment.updatedAt = new Date().toISOString();
        savePayment(latestPayment);
        return;
      }

      if (attempt >= MAX_PROCESSING_ATTEMPTS) {
        latestPayment.status = PAYMENT_STATUSES.FAILED;
        latestPayment.updatedAt = new Date().toISOString();
        savePayment(latestPayment);
        return;
      }

      scheduleRetry(id, payload, attempt);
    })
    .catch(() => {
      const latestPayment = getPayment(id);
      if (!latestPayment || latestPayment.status !== PAYMENT_STATUSES.PROCESSING) {
        return;
      }

      if (attempt >= MAX_PROCESSING_ATTEMPTS) {
        latestPayment.status = PAYMENT_STATUSES.FAILED;
        latestPayment.updatedAt = new Date().toISOString();
        savePayment(latestPayment);
        return;
      }

      scheduleRetry(id, payload, attempt);
    });
}

function processPayment(id, { shouldSucceed } = {}) {
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
    finalizePaymentAttempt(id, { shouldSucceed }, 1);
  }, PROCESSING_COMPLETION_DELAY_MS);

  return payment;
}

function applyPaymentCallback(id, { status, eventId }) {
  const payment = getPayment(id);
  if (!payment) {
    const error = new Error('Payment not found.');
    error.statusCode = 404;
    throw error;
  }

  if (!CALLBACK_FINAL_STATUSES.has(status)) {
    const error = new Error('Callback status must be Success or Failed.');
    error.statusCode = 400;
    throw error;
  }

  const isNewEvent = recordCallbackEvent(id, eventId);
  if (!isNewEvent) {
    return { payment, duplicate: true };
  }

  if (CALLBACK_FINAL_STATUSES.has(payment.status)) {
    if (payment.status !== status) {
      const error = new Error('Conflicting callback state for finalized payment.');
      error.statusCode = 409;
      throw error;
    }

    return { payment, duplicate: true };
  }

  payment.status = status;
  payment.updatedAt = new Date().toISOString();
  savePayment(payment);

  return { payment, duplicate: false };
}

function getPaymentById(id) {
  return getPayment(id);
}

module.exports = {
  PAYMENT_STATUSES,
  PROCESSING_COMPLETION_DELAY_MS,
  MAX_PROCESSING_ATTEMPTS,
  createPayment,
  processPayment,
  applyPaymentCallback,
  getPaymentById,
};
