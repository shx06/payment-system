const { getPaymentSummaryReport } = require('../services/reportingService');

function getPaymentSummaryHandler(_req, res) {
  const summary = getPaymentSummaryReport();
  return res.status(200).json({ success: true, data: summary });
}

module.exports = {
  getPaymentSummaryHandler,
};
