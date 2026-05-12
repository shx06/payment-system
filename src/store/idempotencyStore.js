const idempotencyRecords = new Map();

function saveIdempotencyRecord(key, record) {
  idempotencyRecords.set(key, record);
  return record;
}

function getIdempotencyRecord(key) {
  return idempotencyRecords.get(key) ?? null;
}

function deleteIdempotencyRecord(key) {
  idempotencyRecords.delete(key);
}

function clearIdempotencyRecords() {
  idempotencyRecords.clear();
}

module.exports = {
  saveIdempotencyRecord,
  getIdempotencyRecord,
  deleteIdempotencyRecord,
  clearIdempotencyRecords,
};
