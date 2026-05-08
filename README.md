# payment-system

Node.js + Express backend for the payment gateway assignment.

All assignment implementation, future code changes, and pull requests are scoped to this repository: `shx06/payment-system`.

## Current implementation status (post-scaffolding)

- Initial backend scaffolding
- Health route: `GET /health`
- Payment lifecycle flow:
  - Create payment: `POST /api/payments`
  - Process payment: `POST /api/payments/:paymentId/process` (moves to `Processing`, then asynchronously finalizes)
  - Fetch payment status: `GET /api/payments/:paymentId`
- Failure handling + retry flow:
  - Retries failed processing with exponential backoff (`PAYMENT_MAX_PROCESSING_ATTEMPTS`, default: `3`)
  - Tracks attempt metadata (`processingAttempts`, `retryCount`, `lastError`)

## Pending flows from assignment

- Idempotency protections for repeated create/process requests
- Stronger concurrency control for simultaneous process calls
- External gateway simulation (random success/failure/delay/timeout)
- Webhook/callback handling (early/duplicate/conflicting callbacks)
- Additional data consistency safeguards for partial failures
- Expanded observability/logging coverage
- Broader edge-case test coverage beyond current core + retry scenarios

## Request payloads

### Create payment

```json
{
  "amount": 150.5,
  "currency": "USD",
  "reference": "INV-1001"
}
```

### Process payment

```json
{
  "shouldSucceed": true,
  "failuresBeforeSuccess": 1
}
```

## Assumptions (for ambiguous requirements)

- This implementation covers payment lifecycle plus retry/backoff handling.
- Storage is in-memory for now, so data resets on restart.
- Idempotency, stronger concurrency locking, gateway randomness/timeouts, webhooks, and advanced observability are intentionally left for subsequent feature PRs.
- Currency validation currently expects a 3-letter uppercase code format.

## Run locally

```bash
npm install
npm start
```

## Tests

```bash
npm test
```
