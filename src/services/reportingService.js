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

  for (const payment of payments) {
    countByStatus[payment.status] += 1;
    amountByStatus[payment.status] += payment.amount;
    totalAmount += payment.amount;
  }

  return {
    totalPayments: payments.length,
    totalAmount,
    countByStatus,
    amountByStatus,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  getPaymentSummaryReport,
};
