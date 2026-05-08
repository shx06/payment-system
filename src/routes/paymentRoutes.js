const express = require('express');
const {
  createPaymentHandler,
  getPaymentHandler,
  processPaymentHandler,
} = require('../controllers/paymentController');

const router = express.Router();

router.post('/', createPaymentHandler);
router.get('/:paymentId', getPaymentHandler);
router.post('/:paymentId/process', processPaymentHandler);

module.exports = router;
