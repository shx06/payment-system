const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');
const { clearPayments } = require('../src/store/paymentStore');

async function waitForStatus(paymentId, expectedStatus) {
  const maxAttempts = 10;
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
