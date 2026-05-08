const { buildUser } = require('../models/userModel');
const { getUserByEmail, saveUser } = require('../store/userStore');

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function registerUser(payload) {
  const normalizedEmail = payload.email.trim().toLowerCase();
  const existingUser = getUserByEmail(normalizedEmail);
  if (existingUser) {
    const error = new Error('User already exists.');
    error.statusCode = 409;
    throw error;
  }

  const user = buildUser(payload);
  saveUser(user);
  return toPublicUser(user);
}

module.exports = {
  registerUser,
};
