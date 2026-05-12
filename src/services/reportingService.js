const { PAYMENT_STATUSES } = require('./paymentService');
const { listPayments } = require('../store/paymentStore');

function buildEmptyStatusMap() {
  return {
    [PAYMENT_STATUSES.PENDING]: 0,
    [PAYMENT_STATUSES.PROCESSING]: 0,
    [PAYMENT_STATUSES.SUCCESS]: 0,
    [PAYMENT_STATUSES.FAILED]: 0,
  };
}

function getPaymentSummaryReport() {
  const payments = listPayments();
  const countByStatus = buildEmptyStatusMap();
  const amountByStatus = buildEmptyStatusMap();
  let totalAmount = 0;
  let totalRetries = 0;

  for (const payment of payments) {
    countByStatus[payment.status] += 1;
    amountByStatus[payment.status] += payment.amount;
    totalAmount += payment.amount;
    totalRetries += payment.retryCount ?? 0;
  }

  return {
    totalPayments: payments.length,
    totalAmount,
    totalRetries,
    successRate: payments.length === 0 ? 0 : countByStatus[PAYMENT_STATUSES.SUCCESS] / payments.length,
    countByStatus,
    amountByStatus,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  getPaymentSummaryReport,
};
