const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');
const { clearPayments, clearPaymentLocks } = require('../src/store/paymentStore');
const { clearIdempotencyRecords } = require('../src/store/idempotencyStore');
const { setRandomGenerator, resetRandomGenerator } = require('../src/services/paymentService');

async function waitForStatus(paymentId, expectedStatus) {
  const maxAttempts = 20;
  const delayMs = 20;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await request(app).get(`/api/payments/${paymentId}`);
    if (response.body.data.status === expectedStatus) {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`Timed out waiting for status ${expectedStatus}.`);
}

test.beforeEach(() => {
  clearPayments();
  clearPaymentLocks();
  clearIdempotencyRecords();
  resetRandomGenerator();
});

test('GET /health returns service health', async () => {
  const response = await request(app).get('/health');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.message, 'ok');
});

test('POST /api/payments creates a payment in pending state', async () => {
  const response = await request(app)
    .post('/api/payments')
    .send({ amount: 150.5, currency: 'USD', reference: 'INV-1' });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.status, 'Pending');
  assert.equal(response.body.data.amount, 150.5);
  assert.equal(response.body.data.currency, 'USD');
});

test('payment lifecycle transitions to success when processed', async () => {
  const created = await request(app)
    .post('/api/payments')
    .send({ amount: 100, currency: 'USD' });

  const processingResponse = await request(app)
    .post(`/api/payments/${created.body.data.id}/process`)
    .send({ shouldSucceed: true });

  assert.equal(processingResponse.statusCode, 200);
  assert.equal(processingResponse.body.data.status, 'Processing');

  const finalState = await waitForStatus(created.body.data.id, 'Success');
  assert.equal(finalState.statusCode, 200);
  assert.equal(finalState.body.data.status, 'Success');
  assert.equal(finalState.body.data.processingAttempts, 1);
  assert.equal(finalState.body.data.retryCount, 0);
});

test('payment lifecycle transitions to failed when processed with failure', async () => {
  const created = await request(app)
    .post('/api/payments')
    .send({ amount: 100, currency: 'USD' });

  const processingResponse = await request(app)
    .post(`/api/payments/${created.body.data.id}/process`)
    .send({ shouldSucceed: false });

  assert.equal(processingResponse.statusCode, 200);
  assert.equal(processingResponse.body.data.status, 'Processing');

  const finalState = await waitForStatus(created.body.data.id, 'Failed');
  assert.equal(finalState.statusCode, 200);
  assert.equal(finalState.body.data.status, 'Failed');
  assert.equal(finalState.body.data.processingAttempts, 3);
  assert.equal(finalState.body.data.retryCount, 2);
});

test('payment processing retries transient failures before succeeding', async () => {
  const created = await request(app)
    .post('/api/payments')
    .send({ amount: 100, currency: 'USD' });

  const processingResponse = await request(app)
    .post(`/api/payments/${created.body.data.id}/process`)
    .send({ shouldSucceed: true, failuresBeforeSuccess: 2 });

  assert.equal(processingResponse.statusCode, 200);
  assert.equal(processingResponse.body.data.status, 'Processing');

  const finalState = await waitForStatus(created.body.data.id, 'Success');
  assert.equal(finalState.statusCode, 200);
  assert.equal(finalState.body.data.status, 'Success');
  assert.equal(finalState.body.data.processingAttempts, 3);
  assert.equal(finalState.body.data.retryCount, 2);
});

test('GET /api/payments/:id returns payment status', async () => {
  const created = await request(app)
    .post('/api/payments')
    .send({ amount: 75, currency: 'EUR' });

  const response = await request(app).get(`/api/payments/${created.body.data.id}`);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.status, 'Pending');
});

test('returns validation error for invalid create payload', async () => {
  const response = await request(app)
    .post('/api/payments')
    .send({ amount: 0, currency: 'usd' });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
});

test('returns conflict when processing payment again from non-pending state', async () => {
  const created = await request(app)
    .post('/api/payments')
    .send({ amount: 10, currency: 'USD' });

  const firstAttempt = await request(app)
    .post(`/api/payments/${created.body.data.id}/process`)
    .send({ shouldSucceed: true });
  assert.equal(firstAttempt.statusCode, 200);
  assert.equal(firstAttempt.body.data.status, 'Processing');

  await waitForStatus(created.body.data.id, 'Success');

  const secondAttempt = await request(app)
    .post(`/api/payments/${created.body.data.id}/process`)
    .send({ shouldSucceed: false });

  assert.equal(secondAttempt.statusCode, 409);
  assert.equal(secondAttempt.body.success, false);
  assert.equal(secondAttempt.body.error, 'Payment cannot be processed from its current state.');
});

test('returns conflict when processing is already in progress', async () => {
  const created = await request(app)
    .post('/api/payments')
    .send({ amount: 15, currency: 'USD' });

  const firstAttempt = await request(app)
    .post(`/api/payments/${created.body.data.id}/process`)
    .send({ shouldSucceed: true });
  assert.equal(firstAttempt.statusCode, 200);

  const secondAttempt = await request(app)
    .post(`/api/payments/${created.body.data.id}/process`)
    .send({ shouldSucceed: true });

  assert.equal(secondAttempt.statusCode, 409);
  assert.equal(secondAttempt.body.success, false);
  assert.equal(secondAttempt.body.error, 'Payment is already being processed by another request.');
});

test('returns not found when processing a payment that does not exist', async () => {
  const response = await request(app)
    .post('/api/payments/does-not-exist/process')
    .send({ shouldSucceed: true });

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error, 'Payment not found.');
});

test('returns bad request for invalid json payload', async () => {
  const response = await request(app)
    .post('/api/payments')
    .set('Content-Type', 'application/json')
    .send('{"amount":100');

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error, 'Request body must be valid JSON.');
});

test('returns validation error for invalid failuresBeforeSuccess', async () => {
  const created = await request(app)
    .post('/api/payments')
    .send({ amount: 100, currency: 'USD' });

  const response = await request(app)
    .post(`/api/payments/${created.body.data.id}/process`)
    .send({ shouldSucceed: true, failuresBeforeSuccess: -1 });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.equal(
    response.body.error,
    'failuresBeforeSuccess must be a non-negative integer when provided.',
  );
});

test('returns validation error for non-integer failuresBeforeSuccess', async () => {
  const created = await request(app)
    .post('/api/payments')
    .send({ amount: 100, currency: 'USD' });

  const response = await request(app)
    .post(`/api/payments/${created.body.data.id}/process`)
    .send({ shouldSucceed: true, failuresBeforeSuccess: 1.5 });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.equal(
    response.body.error,
    'failuresBeforeSuccess must be a non-negative integer when provided.',
  );
});

test('returns validation error for invalid gatewayMode', async () => {
  const created = await request(app)
    .post('/api/payments')
    .send({ amount: 100, currency: 'USD' });

  const response = await request(app)
    .post(`/api/payments/${created.body.data.id}/process`)
    .send({ gatewayMode: 'random' });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.equal(
    response.body.error,
    'gatewayMode must be either "deterministic" or "simulated" when provided.',
  );
});

test('reuses the same payment for duplicate create requests with the same idempotency key', async () => {
  const firstResponse = await request(app)
    .post('/api/payments')
    .set('Idempotency-Key', 'create-payment-1')
    .send({ amount: 150.5, currency: 'USD', reference: 'INV-1001' });

  const secondResponse = await request(app)
    .post('/api/payments')
    .set('Idempotency-Key', 'create-payment-1')
    .send({ amount: 150.5, currency: 'USD', reference: 'INV-1001' });

  assert.equal(firstResponse.statusCode, 201);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(secondResponse.headers['idempotency-replayed'], 'true');
  assert.equal(secondResponse.body.data.id, firstResponse.body.data.id);
});

test('returns conflict when a create idempotency key is reused for a different payload', async () => {
  const firstResponse = await request(app)
    .post('/api/payments')
    .set('Idempotency-Key', 'create-payment-conflict')
    .send({ amount: 150.5, currency: 'USD', reference: 'INV-1001' });

  const secondResponse = await request(app)
    .post('/api/payments')
    .set('Idempotency-Key', 'create-payment-conflict')
    .send({ amount: 200, currency: 'USD', reference: 'INV-2002' });

  assert.equal(firstResponse.statusCode, 201);
  assert.equal(secondResponse.statusCode, 409);
  assert.equal(secondResponse.body.success, false);
  assert.equal(secondResponse.body.error, 'Idempotency key is already used for a different request.');
});

test('reuses the same processing request for duplicate process calls with the same idempotency key', async () => {
  const created = await request(app)
    .post('/api/payments')
    .send({ amount: 100, currency: 'USD' });

  const firstResponse = await request(app)
    .post(`/api/payments/${created.body.data.id}/process`)
    .set('Idempotency-Key', 'process-payment-1')
    .send({ shouldSucceed: true });

  const secondResponse = await request(app)
    .post(`/api/payments/${created.body.data.id}/process`)
    .set('Idempotency-Key', 'process-payment-1')
    .send({ shouldSucceed: true });

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(secondResponse.headers['idempotency-replayed'], 'true');
  assert.equal(secondResponse.body.data.id, firstResponse.body.data.id);

  const finalState = await waitForStatus(created.body.data.id, 'Success');
  assert.equal(finalState.body.data.processingAttempts, 1);
  assert.equal(finalState.body.data.retryCount, 0);
});

test('returns conflict when a process idempotency key is reused for a different payload', async () => {
  const created = await request(app)
    .post('/api/payments')
    .send({ amount: 100, currency: 'USD' });

  const firstResponse = await request(app)
    .post(`/api/payments/${created.body.data.id}/process`)
    .set('Idempotency-Key', 'process-payment-conflict')
    .send({ shouldSucceed: true, failuresBeforeSuccess: 0 });

  const secondResponse = await request(app)
    .post(`/api/payments/${created.body.data.id}/process`)
    .set('Idempotency-Key', 'process-payment-conflict')
    .send({ shouldSucceed: true, failuresBeforeSuccess: 1 });

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 409);
  assert.equal(secondResponse.body.success, false);
  assert.equal(secondResponse.body.error, 'Idempotency key is already used for a different request.');
});

test('returns validation error for an empty idempotency key header', async () => {
  const response = await request(app)
    .post('/api/payments')
    .set('Idempotency-Key', '   ')
    .send({ amount: 150.5, currency: 'USD', reference: 'INV-1001' });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.equal(
    response.body.error,
    'Idempotency-Key header must be a non-empty string when provided.',
  );
});

test('simulated gateway mode retries after timeout and succeeds on second attempt', { concurrency: false }, async (t) => {
  const created = await request(app)
    .post('/api/payments')
    .send({ amount: 120, currency: 'USD' });

  const timeoutOutcomeRoll = 0.1;
  const minDelayRoll = 0;
  const successOutcomeRoll = 0.95;
  const fallbackSuccessOutcomeRoll = successOutcomeRoll;
  const randomSequence = [timeoutOutcomeRoll, minDelayRoll, successOutcomeRoll, minDelayRoll];
  setRandomGenerator(() => randomSequence.shift() ?? fallbackSuccessOutcomeRoll);
  t.after(() => {
    resetRandomGenerator();
  });

  const processingResponse = await request(app)
    .post(`/api/payments/${created.body.data.id}/process`)
    .send({ gatewayMode: 'simulated' });

  assert.equal(processingResponse.statusCode, 200);
  assert.equal(processingResponse.body.data.status, 'Processing');

  const finalState = await waitForStatus(created.body.data.id, 'Success');
  assert.equal(finalState.statusCode, 200);
  assert.equal(finalState.body.data.status, 'Success');
  assert.equal(finalState.body.data.processingAttempts, 2);
  assert.equal(finalState.body.data.retryCount, 1);
  assert.equal(finalState.body.data.lastError, null);
});
