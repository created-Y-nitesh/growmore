const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const openApiSpec = require('./docs/openapi.json');
require('dotenv').config();

const { generalLimiter } = require('./middleware/rateLimiter');
const requestIdMiddleware = require('./middleware/requestId');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const pool = require('./db');
const jobQueue = require('./services/jobQueueService');
const scheduledTasksService = require('./services/scheduledTasksService');

const authRoutes = require('./routes/authRoutes');
const planRoutes = require('./routes/planRoutes');
const healthRoutes = require('./routes/healthRoutes');
const investmentRoutes = require('./routes/investmentRoutes');
const walletRoutes = require('./routes/walletRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const depositRoutes = require('./routes/depositRoutes');
const withdrawalRoutes = require('./routes/withdrawalRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const supportRoutes = require('./routes/supportRoutes');
const profileRoutes = require('./routes/profileRoutes');
const kycRoutes = require('./routes/kycRoutes');
const storageRoutes = require('./routes/storageRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Security headers with Swagger asset allowance
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS configuration for the frontend origin
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5173'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.indexOf(origin) !== -1 ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      process.env.NODE_ENV === 'development'
    ) {
      return callback(null, true);
    }
    return callback(new Error('CORS policy: Not allowed by CORS origin rules'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-request-id',
    'x-uropay-signature',
    'x-signature',
    'x-provider-signature',
    'x-payout-signature',
    'x-hub-signature-256'
  ]
}));

// Stream raw body for multipart/form-data and octet-stream
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data') || contentType.includes('application/octet-stream')) {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      req.rawBody = Buffer.concat(chunks);
      next();
    });
    req.on('error', next);
  } else {
    next();
  }
});

// Body parser with rawBody capture for webhook signature verification
app.use(express.json({
  limit: '15mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cookieParser());

// Assign Request ID & structured request logging
app.use(requestIdMiddleware);

// Monitoring & Health Probes (Direct root access for k8s / ECS / uptime monitors)
const healthController = require('./controllers/healthController');
app.get('/health', healthController.getHealth);
app.get('/ready', healthController.getReadiness);
app.get('/metrics', healthController.getMetrics);

// Apply general rate limiting across all API endpoints
app.use('/api', generalLimiter);

// Root route
app.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'GrowMore API Server',
    status: 'Operational',
    version: '1.0.0'
  });
});

// Interactive Swagger API Documentation
app.get('/api/docs/openapi.json', (req, res) => res.json(openApiSpec));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customSiteTitle: 'GrowMore API Documentation',
  customCss: '.swagger-ui .topbar { display: none }'
}));

// Mount modular API routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/storage', storageRoutes);

// 404 Route Handler for undefined endpoints
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    requestId: req.id,
    message: `Resource not found: ${req.method} ${req.originalUrl}`
  });
});

// Centralized error handler with structured error logging
app.use(errorHandler);

// Graceful shutdown management
let serverInstance = null;
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);
  try {
    scheduledTasksService.stopMidnightScheduler();
    await jobQueue.stopWorker({ timeoutMs: 5000 });
    if (serverInstance) {
      serverInstance.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  } catch (err) {
    logger.error('Error during graceful shutdown', { error: err });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server if run directly
if (require.main === module) {
  serverInstance = app.listen(PORT, () => {
    logger.info(`[GrowMore Backend] Server listening at http://localhost:${PORT}`);
    logger.info(`[GrowMore Backend] Allowed Frontend Origin: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);

    // Start background queue worker in non-test mode
    if (process.env.NODE_ENV !== 'test' && process.env.ENABLE_JOB_WORKER !== 'false') {
      jobQueue.startWorker({ pollIntervalMs: 2000 });
      logger.info('[GrowMore Backend] Background job worker started.');
    }

    // Start 12:00 AM Midnight Scheduler for Daily Bonuses (₹99 / ₹300) & Monthly ROI
    scheduledTasksService.startMidnightScheduler();
    logger.info('[GrowMore Backend] 12:00 AM Midnight Scheduler active.');

    // Ensure official investment tiers are active in PostgreSQL
    pool.query('SELECT COUNT(*) FROM investment_plans WHERE is_active = TRUE').then(r => {
      if (parseInt(r.rows[0].count, 10) === 0) {
        require('./scripts/seed_plans')();
      }
    }).catch(e => logger.warn('[AutoSeed Plans note]: ' + e.message));
  });
}

module.exports = app;
