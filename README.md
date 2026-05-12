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
- Webhook/callback flow:
  - Callback endpoint: `POST /api/payments/:paymentId/callback`
  - Handles early callback finalization for in-flight processing
  - Treats duplicate callback states as idempotent replays
  - Rejects conflicting terminal callback states with `409 Conflict`
- Reporting flow:
  - Payment summary endpoint: `GET /api/reports/payments/summary`
  - Returns aggregate payment count/amount grouped by status, plus retry and success-rate metrics
- Data consistency safeguards:
  - Cleans up stale idempotency records that reference missing payments
  - Rolls back create/process state if idempotency persistence fails mid-flow
- Logging & observability:
  - Logs creation, processing, retry scheduling, terminal outcomes, callback updates, and internal errors
- Edge-case handling:
  - Covers stale idempotency recovery and callback failure without reason

## Assignment completion summary

This backend now fulfills the assignment requirements in `backend_assignment_payment_gateway (1).pdf`:

- Payment lifecycle with status tracking
- Retry/failure handling with bounded attempts and exponential backoff
- Idempotency and concurrency control
- External gateway simulation with success/failure/timeout behavior
- Webhook/callback handling including duplicate/conflicting callbacks
- Data consistency safeguards for partial-failure scenarios
- Reporting API for payment aggregates and reliability metrics
- Logging/observability for traceability of lifecycle events
- Integration tests covering core flows, retries, failures, and edge cases

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

### Payment callback

```json
{
  "status": "Success"
}
```

or

```json
{
  "status": "Failed",
  "reason": "Provider declined asynchronously."
}
```

## Assumptions (for ambiguous requirements)

- This implementation covers payment lifecycle plus retry/backoff handling.
- External gateway simulation is enabled by setting `"gatewayMode": "simulated"` on process requests.
- Duplicate create/process requests are treated as idempotent only when the same `Idempotency-Key`
  is reused with the same logical request payload.
- Storage is in-memory for now, so data resets on restart.
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
