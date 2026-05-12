const express = require('express');
const { getPaymentSummaryHandler } = require('../controllers/reportingController');

const router = express.Router();

router.get('/payments/summary', getPaymentSummaryHandler);

module.exports = router;
