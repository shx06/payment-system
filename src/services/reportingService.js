const { PAYMENT_STATUSES } = require('./paymentService');
const { listPayments } = require('../store/paymentStore');

function buildEmptyStatusAmountMap() {
  return {
    [PAYMENT_STATUSES.PENDING]: 0,
    [PAYMENT_STATUSES.PROCESSING]: 0,
    [PAYMENT_STATUSES.SUCCESS]: 0,
    [PAYMENT_STATUSES.FAILED]: 0,
  };
}

function getPaymentSummaryReport() {
  const payments = listPayments();
  const countByStatus = buildEmptyStatusAmountMap();
  const amountByStatus = buildEmptyStatusAmountMap();

  for (const payment of payments) {
    if (countByStatus[payment.status] === undefined) {
      countByStatus[payment.status] = 0;
      amountByStatus[payment.status] = 0;
    }

    countByStatus[payment.status] += 1;
    amountByStatus[payment.status] += payment.amount;
  }

  return {
    totalPayments: payments.length,
    totalAmount: payments.reduce((total, payment) => total + payment.amount, 0),
    countByStatus,
    amountByStatus,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  getPaymentSummaryReport,
};
