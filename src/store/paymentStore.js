const payments = new Map();

function savePayment(payment) {
  payments.set(payment.id, payment);
  return payment;
}

function getPayment(id) {
  return payments.get(id) ?? null;
}

function clearPayments() {
  payments.clear();
}

module.exports = {
  savePayment,
  getPayment,
  clearPayments,
};
