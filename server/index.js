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

// Load routes one by one to find the crash
console.log('Loading auth...');
app.use('/api/auth', require('./routes/auth'));
console.log('Loading setup...');
app.use('/api/setup', require('./routes/setup'));
console.log('Loading prices...');
app.use('/api/prices', require('./routes/prices'));
console.log('Loading attendants...');
app.use('/api/attendants', require('./routes/attendants'));
console.log('Loading meter...');
app.use('/api/meter', require('./routes/meter'));
console.log('Loading tankStock...');
app.use('/api/tank-stock', require('./routes/tankstock'));
console.log('Loading deliveries...');
app.use('/api/deliveries', require('./routes/deliveries'));
console.log('Loading creditors...');
app.use('/api/creditors', require('./routes/creditors'));
console.log('Loading sales...');
app.use('/api/sales', require('./routes/sales'));
console.log('Loading banking...');
app.use('/api/banking', require('./routes/banking'));
console.log('Loading expenses...');
app.use('/api/expenses', require('./routes/expenses'));
console.log('Loading compliance...');
app.use('/api/compliance', require('./routes/compliance'));
console.log('Loading shifts...');
app.use('/api/shifts', require('./routes/shifts'));
console.log('Loading reports...');
app.use('/api/reports', require('./routes/reports'));
console.log('Loading users...');
app.use('/api/users', require('./routes/users'));
console.log('Loading import...');
app.use('/api/import', require('./routes/importData'));
console.log('Loading audit...');
app.use('/api/audit', require('./routes/audit'));
console.log('Loading suggestions...');
app.use('/api/suggestions', require('./routes/suggestions'));
console.log('All routes loaded.');
app.use('/api/pdf', require('./routes/pdf'));
console.log('Loading pdf...');

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