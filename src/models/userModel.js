const { randomUUID, randomBytes, scryptSync } = require('node:crypto');

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

function buildUser({ name, email, password }) {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: hashPassword(password),
    createdAt: now,
    updatedAt: now,
  };
}

module.exports = {
  buildUser,
};
