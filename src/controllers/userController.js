const { registerUser } = require('../services/userService');

function isValidEmail(email) {
  const trimmedEmail = email.trim();
  const atIndex = trimmedEmail.indexOf('@');
  const lastAtIndex = trimmedEmail.lastIndexOf('@');
  const dotIndex = trimmedEmail.lastIndexOf('.');

  if (atIndex <= 0 || atIndex !== lastAtIndex) {
    return false;
  }

  if (dotIndex <= atIndex + 1 || dotIndex === trimmedEmail.length - 1) {
    return false;
  }

  return true;
}

function validateRegisterPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return 'Request body must be a valid JSON object.';
  }

  if (typeof payload.name !== 'string' || payload.name.trim().length < 2) {
    return 'name must be a string with at least 2 characters.';
  }

  if (typeof payload.email !== 'string' || !isValidEmail(payload.email)) {
    return 'email must be a valid email address.';
  }

  if (typeof payload.password !== 'string' || payload.password.trim().length < 8) {
    return 'password must be at least 8 characters long.';
  }

  return null;
}

function registerUserHandler(req, res, next) {
  const validationError = validateRegisterPayload(req.body);
  if (validationError) {
    return res.status(400).json({ success: false, error: validationError });
  }

  try {
    const user = registerUser(req.body);
    return res.status(201).json({ success: true, data: user });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  registerUserHandler,
};
