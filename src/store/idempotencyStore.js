const idempotencyRecords = new Map();

function saveIdempotencyRecord(key, record) {
  idempotencyRecords.set(key, record);
  return record;
}

function getIdempotencyRecord(key) {
  return idempotencyRecords.get(key) ?? null;
}

function clearIdempotencyRecords() {
  idempotencyRecords.clear();
}

module.exports = {
  saveIdempotencyRecord,
  getIdempotencyRecord,
  clearIdempotencyRecords,
};
