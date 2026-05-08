const usersById = new Map();
const userIdByEmail = new Map();

function saveUser(user) {
  usersById.set(user.id, user);
  userIdByEmail.set(user.email.toLowerCase(), user.id);
  return user;
}

function getUserByEmail(email) {
  const userId = userIdByEmail.get(email);
  if (!userId) {
    return null;
  }

  return usersById.get(userId) ?? null;
}

function clearUsers() {
  usersById.clear();
  userIdByEmail.clear();
}

module.exports = {
  saveUser,
  getUserByEmail,
  clearUsers,
};
