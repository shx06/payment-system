const express = require('express');
const healthRoutes = require('./routes/healthRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(express.json());
app.use('/health', healthRoutes);
app.use('/api/payments', paymentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
