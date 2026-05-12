const express = require('express');
const {
  createPaymentHandler,
  getPaymentHandler,
  paymentCallbackHandler,
  processPaymentHandler,
} = require('../controllers/paymentController');

const router = express.Router();

router.post('/', createPaymentHandler);
router.get('/:paymentId', getPaymentHandler);
router.post('/:paymentId/process', processPaymentHandler);
router.post('/:paymentId/callback', paymentCallbackHandler);

module.exports = router;
