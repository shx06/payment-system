const { randomUUID } = require('node:crypto');
const {
  getPayment,
  savePayment,
  acquirePaymentLock,
  releasePaymentLock,
} = require('../store/paymentStore');
const {
  getIdempotencyRecord,
  saveIdempotencyRecord,
} = require('../store/idempotencyStore');

const PAYMENT_STATUSES = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  SUCCESS: 'Success',
  FAILED: 'Failed',
};
const GATEWAY_MODES = {
  DETERMINISTIC: 'deterministic',
  SIMULATED: 'simulated',
};
const DEFAULT_PROCESSING_COMPLETION_DELAY_MS = 20;
const DEFAULT_RETRY_BASE_DELAY_MS = 25;
const MAX_RETRY_DELAY_MS = 2000;
const DEFAULT_MAX_PROCESSING_ATTEMPTS = 3;
const SIMULATED_GATEWAY_MIN_DELAY_MS = 10;
const SIMULATED_GATEWAY_MAX_DELAY_MS = 120;
const parsedProcessingCompletionDelay = Number.parseInt(process.env.PAYMENT_PROCESSING_DELAY_MS ?? '', 10);
const parsedRetryBaseDelay = Number.parseInt(process.env.PAYMENT_RETRY_BASE_DELAY_MS ?? '', 10);
const parsedMaxProcessingAttempts = Number.parseInt(
  process.env.PAYMENT_MAX_PROCESSING_ATTEMPTS ?? process.env.PAYMENT_MAX_RETRY_ATTEMPTS ?? '',
  10,
);
const PROCESSING_COMPLETION_DELAY_MS = Number.isInteger(parsedProcessingCompletionDelay) && parsedProcessingCompletionDelay > 0
  ? parsedProcessingCompletionDelay
  : DEFAULT_PROCESSING_COMPLETION_DELAY_MS;
const RETRY_BASE_DELAY_MS = Number.isInteger(parsedRetryBaseDelay) && parsedRetryBaseDelay > 0
  ? parsedRetryBaseDelay
  : DEFAULT_RETRY_BASE_DELAY_MS;
const MAX_PROCESSING_ATTEMPTS = Number.isInteger(parsedMaxProcessingAttempts) && parsedMaxProcessingAttempts > 0
  ? parsedMaxProcessingAttempts
  : DEFAULT_MAX_PROCESSING_ATTEMPTS;

function createConflictError(message, statusCode = 409) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function buildCreatePaymentFingerprint({ amount, currency, reference }) {
  return JSON.stringify({
    scope: 'create-payment',
    amount,
    currency,
    reference: reference ?? null,
  });
}

function buildProcessPaymentFingerprint(id, { shouldSucceed, failuresBeforeSuccess, gatewayMode }) {
  const normalizedShouldSucceed = shouldSucceed ?? true;
  const normalizedFailuresBeforeSuccess = failuresBeforeSuccess ?? 0;
  const normalizedGatewayMode = gatewayMode ?? GATEWAY_MODES.DETERMINISTIC;

  return JSON.stringify({
    scope: 'process-payment',
    paymentId: id,
    shouldSucceed: normalizedShouldSucceed,
    failuresBeforeSuccess: normalizedFailuresBeforeSuccess,
    gatewayMode: normalizedGatewayMode,
  });
}

function resolveIdempotentPayment(idempotencyKey, fingerprint) {
  if (!idempotencyKey) {
    return null;
  }

  const existingRecord = getIdempotencyRecord(idempotencyKey);
  if (!existingRecord) {
    return null;
  }

  if (existingRecord.fingerprint !== fingerprint) {
    throw createConflictError('Idempotency key is already used for a different request.');
  }

  const payment = getPayment(existingRecord.paymentId);
  if (!payment) {
    throw createConflictError(
      'Internal error: payment referenced by idempotency key no longer exists.',
      500,
    );
  }

  return payment;
}

function storeIdempotencyRecord(idempotencyKey, fingerprint, paymentId) {
  if (!idempotencyKey) {
    return;
  }

  saveIdempotencyRecord(idempotencyKey, { fingerprint, paymentId });
}

function createPayment({ amount, currency, reference, idempotencyKey }) {
  const fingerprint = buildCreatePaymentFingerprint({ amount, currency, reference });
  const existingPayment = resolveIdempotentPayment(idempotencyKey, fingerprint);
  if (existingPayment) {
    return { payment: existingPayment, replayed: true };
  }

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

  savePayment(payment);
  storeIdempotencyRecord(idempotencyKey, fingerprint, payment.id);

  return { payment, replayed: false };
}

function scheduleRetry(id, nextAttempt, options) {
  const retryDelay = Math.min(RETRY_BASE_DELAY_MS * (2 ** (nextAttempt - 1)), MAX_RETRY_DELAY_MS);
  setTimeout(() => {
    runProcessingAttempt(id, nextAttempt, options);
  }, retryDelay);
}

function getSimulatedAttemptPlan() {
  const outcomeRoll = Math.random();
  const outcome = outcomeRoll < 0.2
    ? 'timeout'
    : outcomeRoll < 0.6
      ? 'failure'
      : 'success';
  const delayRange = SIMULATED_GATEWAY_MAX_DELAY_MS - SIMULATED_GATEWAY_MIN_DELAY_MS + 1;
  const delayMs = SIMULATED_GATEWAY_MIN_DELAY_MS + Math.floor(Math.random() * delayRange);

  return { outcome, delayMs };
}

function runProcessingAttempt(
  id,
  attempt,
  { shouldSucceed = true, failuresBeforeSuccess = 0, gatewayMode = GATEWAY_MODES.DETERMINISTIC } = {},
) {
  const simulatedPlan = gatewayMode === GATEWAY_MODES.SIMULATED ? getSimulatedAttemptPlan() : null;
  const completionDelayMs = simulatedPlan ? simulatedPlan.delayMs : PROCESSING_COMPLETION_DELAY_MS;

  setTimeout(() => {
    try {
      const latestPayment = getPayment(id);
      if (!latestPayment || latestPayment.status !== PAYMENT_STATUSES.PROCESSING) {
        releasePaymentLock(id);
        return;
      }

      latestPayment.processingAttempts += 1;
      latestPayment.updatedAt = new Date().toISOString();

      const wasSuccessful = simulatedPlan
        ? simulatedPlan.outcome === 'success'
        : shouldSucceed && attempt > failuresBeforeSuccess;

      if (wasSuccessful) {
        latestPayment.status = PAYMENT_STATUSES.SUCCESS;
        latestPayment.lastError = null;
        savePayment(latestPayment);
        releasePaymentLock(id);
        return;
      }

      if (simulatedPlan) {
        latestPayment.lastError = simulatedPlan.outcome === 'timeout'
          ? `Gateway request timed out on attempt ${attempt}.`
          : `Gateway processing failed on attempt ${attempt}.`;
      } else {
        latestPayment.lastError = `Gateway processing failed on attempt ${attempt}.`;
      }

      if (attempt < MAX_PROCESSING_ATTEMPTS) {
        latestPayment.retryCount += 1;
        savePayment(latestPayment);
        scheduleRetry(id, attempt + 1, { shouldSucceed, failuresBeforeSuccess, gatewayMode });
        return;
      }

      latestPayment.status = PAYMENT_STATUSES.FAILED;
      savePayment(latestPayment);
      releasePaymentLock(id);
    } catch (error) {
      releasePaymentLock(id);
      console.error('Failed to process payment attempt.', {
        paymentId: id,
        attempt,
        error,
      });
    }
  }, completionDelayMs);
}

function processPayment(
  id,
  {
    shouldSucceed = true,
    failuresBeforeSuccess = 0,
    gatewayMode = GATEWAY_MODES.DETERMINISTIC,
    idempotencyKey,
  } = {},
) {
  const fingerprint = buildProcessPaymentFingerprint(id, {
    shouldSucceed,
    failuresBeforeSuccess,
    gatewayMode,
  });
  const existingPayment = resolveIdempotentPayment(idempotencyKey, fingerprint);
  if (existingPayment) {
    return { payment: existingPayment, replayed: true };
  }

  if (!acquirePaymentLock(id)) {
    throw createConflictError('Payment is already being processed by another request.');
  }

  try {
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
    storeIdempotencyRecord(idempotencyKey, fingerprint, payment.id);

    runProcessingAttempt(id, 1, { shouldSucceed, failuresBeforeSuccess, gatewayMode });

    return { payment, replayed: false };
  } catch (error) {
    releasePaymentLock(id);
    throw error;
  }
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
