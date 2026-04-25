const express   = require('express');
const mongoose  = require('mongoose');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes     = require('./routes/auth');
const questionRoutes = require('./routes/questions');
const uploadRoutes   = require('./routes/upload');
const statsRoutes    = require('./routes/stats');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ──────────────────────────────────────────────
app.use(helmet());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({
  origin     : [process.env.CLIENT_URL || 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

// JSON body for non-file routes; files handled by multer in routes
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

// ── MongoDB Atlas ───────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('✅  Connected to MongoDB Atlas — dsatracker'))
  .catch(err => { console.error('❌  MongoDB error:', err.message); process.exit(1); });

mongoose.connection.on('disconnected', () => console.warn('⚠️   MongoDB disconnected'));
mongoose.connection.on('reconnected',  () => console.log('✅  MongoDB reconnected'));

// ── Routes ──────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/upload',    uploadRoutes);
app.use('/api/stats',     statsRoutes);

app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' })
);

// ── Error handlers ──────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () =>
  console.log(`🚀  Server → http://localhost:${PORT}  [${process.env.NODE_ENV}]`)
);
