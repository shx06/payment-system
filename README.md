# payment-system

Node.js + Express backend for the payment gateway assignment.

All assignment implementation, future code changes, and pull requests are scoped to this repository: `shx06/payment-system`.

## Implemented in this PR

- Initial backend scaffolding
- Health route: `GET /health`
- First business flow (payment lifecycle):
  - Create payment: `POST /api/payments`
  - Process payment: `POST /api/payments/:paymentId/process` (moves to `Processing`, then asynchronously finalizes)
  - Fetch payment status: `GET /api/payments/:paymentId`

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
  "shouldSucceed": true
}
```

## Assumptions (for ambiguous requirements)

- This PR only covers the first required business flow: payment lifecycle (Pending → Processing → Success/Failed).
- Storage is in-memory for now, so data resets on restart.
- External gateway simulation, retry/backoff, idempotency, concurrency locking, webhooks, and advanced observability are intentionally left for subsequent feature PRs.
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
