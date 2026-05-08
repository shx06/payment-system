const { createPayment, getPaymentById, processPayment } = require('../services/paymentService');

function validateCreatePaymentPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return 'Request body must be a valid JSON object.';
  }

  const { amount, currency, reference } = payload;

  if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
    return 'amount must be a positive number.';
  }

  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
    return 'currency must be a 3-letter uppercase ISO code.';
  }

  if (reference !== undefined && (typeof reference !== 'string' || reference.trim().length === 0)) {
    return 'reference must be a non-empty string when provided.';
  }

  return null;
}

function validateProcessPayload(payload) {
  if (payload === undefined) {
    return null;
  }

  if (!payload || typeof payload !== 'object') {
    return 'Request body must be a valid JSON object.';
  }

  if (payload.shouldSucceed !== undefined && typeof payload.shouldSucceed !== 'boolean') {
    return 'shouldSucceed must be a boolean when provided.';
  }

  if (
    payload.failuresBeforeSuccess !== undefined
    && (!Number.isInteger(payload.failuresBeforeSuccess) || payload.failuresBeforeSuccess < 0)
  ) {
    return 'failuresBeforeSuccess must be a non-negative integer when provided.';
  }

  return null;
}

function createPaymentHandler(req, res) {
  const validationError = validateCreatePaymentPayload(req.body);
  if (validationError) {
    return res.status(400).json({ success: false, error: validationError });
  }

  const payment = createPayment(req.body);
  return res.status(201).json({ success: true, data: payment });
}

function processPaymentHandler(req, res, next) {
  const validationError = validateProcessPayload(req.body);
  if (validationError) {
    return res.status(400).json({ success: false, error: validationError });
  }

  try {
    const payment = processPayment(req.params.paymentId, req.body);
    return res.status(200).json({ success: true, data: payment });
  } catch (error) {
    return next(error);
  }
}

function getPaymentHandler(req, res) {
  const payment = getPaymentById(req.params.paymentId);

  if (!payment) {
    return res.status(404).json({ success: false, error: 'Payment not found.' });
  }

  return res.status(200).json({ success: true, data: payment });
}

module.exports = {
  createPaymentHandler,
  processPaymentHandler,
  getPaymentHandler,
};
