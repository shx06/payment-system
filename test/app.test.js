const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');
const { clearPayments } = require('../src/store/paymentStore');
const { clearUsers } = require('../src/store/userStore');

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
  clearUsers();
});

test('GET /health returns service health', async () => {
  const response = await request(app).get('/health');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.message, 'ok');
});

test('POST /api/users/register registers a user', async () => {
  const response = await request(app)
    .post('/api/users/register')
    .send({ name: 'Alice Doe', email: 'alice@example.com', password: 'securePass123' });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.success, true);
  assert.ok(response.body.data.id);
  assert.equal(response.body.data.name, 'Alice Doe');
  assert.equal(response.body.data.email, 'alice@example.com');
  assert.equal(Object.hasOwn(response.body.data, 'password'), false);
  assert.equal(Object.hasOwn(response.body.data, 'passwordHash'), false);
});

test('POST /api/users/register returns validation error for invalid payload', async () => {
  const response = await request(app)
    .post('/api/users/register')
    .send({ name: 'A', email: 'not-an-email', password: '123' });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error, 'name must be a string with at least 2 characters.');
});

test('POST /api/users/register returns conflict for duplicate email', async () => {
  const firstResponse = await request(app)
    .post('/api/users/register')
    .send({ name: 'Alice Doe', email: 'alice@example.com', password: 'securePass123' });
  assert.equal(firstResponse.statusCode, 201);

  const secondResponse = await request(app)
    .post('/api/users/register')
    .send({ name: 'Another Alice', email: 'ALICE@example.com', password: 'securePass456' });

  assert.equal(secondResponse.statusCode, 409);
  assert.equal(secondResponse.body.success, false);
  assert.equal(secondResponse.body.error, 'User already exists.');
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

  const secondAttempt = await request(app)
    .post(`/api/payments/${created.body.data.id}/process`)
    .send({ shouldSucceed: false });

  assert.equal(secondAttempt.statusCode, 409);
  assert.equal(secondAttempt.body.success, false);
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
