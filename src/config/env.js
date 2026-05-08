const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

module.exports = {
  PORT: Number.isNaN(PORT) ? 3000 : PORT,
};
