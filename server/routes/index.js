const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// express-rate-limit has been an installed dependency this whole time,
// never actually wired up. Scoped specifically to /api/auth rather than
// applied globally — this is the endpoint that matters most (unthrottled
// login is a straightforward brute-force target, especially given
// Viewer/attendant accounts are described as living on shared phones),
// and a blanket limit across every route risks interfering with
// legitimate heavy usage (bulk import, report generation) for no real
// security benefit on those routes, which are already authenticated.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts — please wait a few minutes and try again' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/auth', authLimiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/setup', require('./routes/setup'));
app.use('/api/prices', require('./routes/prices'));
app.use('/api/attendants', require('./routes/attendants'));
app.use('/api/meter', require('./routes/meter'));
app.use('/api/tank-stock', require('./routes/tankstock'));
app.use('/api/deliveries', require('./routes/deliveries'));
app.use('/api/creditors', require('./routes/creditors'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/banking', require('./routes/banking'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/compliance', require('./routes/compliance'));
app.use('/api/shifts', require('./routes/shifts'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/users', require('./routes/users'));
app.use('/api/import', require('./routes/importData'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/suggestions', require('./routes/suggestions'));
app.use('/api/pdf', require('./routes/pdf'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`GOIL Station API running on port ${PORT}`);
});