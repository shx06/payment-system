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
- Idempotency flow:
  - Optional `Idempotency-Key` header safely replays duplicate create/process requests
  - Conflicting reuse of an idempotency key returns `409 Conflict`
- Concurrency control flow:
  - Prevents parallel processing of the same payment during in-flight processing
  - Returns `409 Conflict` if another processing request is already active
- External gateway simulation flow:
  - Process payment can run in `simulated` gateway mode with random success/failure/timeout and random delay
  - Timeouts and failures are retried with existing backoff and attempt limits

## Pending flows from assignment

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

Optional header:

```text
Idempotency-Key: create-payment-1
```

### Process payment

```json
{
  "shouldSucceed": true,
  "failuresBeforeSuccess": 1,
  "gatewayMode": "deterministic"
}
```

Optional header:

```text
Idempotency-Key: process-payment-1
```

## Assumptions (for ambiguous requirements)

- This implementation covers payment lifecycle plus retry/backoff handling.
- External gateway simulation is enabled by setting `"gatewayMode": "simulated"` on process requests.
- Duplicate create/process requests are treated as idempotent only when the same `Idempotency-Key`
  is reused with the same logical request payload.
- Storage is in-memory for now, so data resets on restart.
- Stronger concurrency locking, webhooks/callbacks, and advanced observability are intentionally
  left for subsequent feature PRs.
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
