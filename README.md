# payment-system

Node.js + Express backend for the payment gateway assignment.

## Implemented in this PR

- Initial backend scaffolding
- Health route: `GET /health`
- Payment lifecycle:
  - Create payment: `POST /api/payments`
  - Process payment: `POST /api/payments/:paymentId/process` (moves to `Processing`, then asynchronously finalizes with retry/backoff and gateway simulation)
  - Fetch payment status: `GET /api/payments/:paymentId`
  - Handle gateway callback: `POST /api/payments/:paymentId/callback`
- Idempotent payment creation via `Idempotency-Key` header

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
Idempotency-Key: order-12345
```

### Process payment

```json
{
  "shouldSucceed": true
}
```

### Callback update

```json
{
  "status": "Success",
  "eventId": "evt-123"
}
```

## Assumptions (for ambiguous requirements)

- Storage is in-memory for now, so data resets on restart.
- Callback state only supports final statuses (`Success` / `Failed`) and rejects conflicting final-state updates.
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
