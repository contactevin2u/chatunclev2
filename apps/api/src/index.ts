import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { config, validateConfig } from './config/env.js';
import { testConnection, closePool } from './db/index.js';
import { initializeSocket, broadcastQRUpdate } from './realtime/socket.js';
import { getChannelRouter, destroyChannelRouter } from './channels/router.js';
import QRCode from 'qrcode';
import { getDeduplicator } from './services/deduplication.js';

// Import routes
import authRoutes from './modules/auth/routes.js';
import accountRoutes from './modules/accounts/routes.js';
import conversationRoutes from './modules/conversations/routes.js';
import messageRoutes from './modules/messages/routes.js';

const app = express();
const httpServer = createServer(app);

// ============================================
// MIDDLEWARE
// ============================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API
}));

// CORS
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (config.isDev || duration > 1000) {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', async (req, res) => {
  const dbConnected = await testConnection();
  const dedup = getDeduplicator();
  const dedupStats = dedup.getStats();
  const router = getChannelRouter();

  res.json({
    status: dbConnected ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
    channels: {
      active: router.getAllActiveAccounts().length,
    },
    deduplication: {
      memorySize: dedupStats.memorySize,
      memoryHitRate: `${(dedupStats.memoryHitRate * 100).toFixed(1)}%`,
    },
  });
});

// ============================================
// API ROUTES
// ============================================

app.get('/', (req, res) => {
  res.json({
    name: 'ChatUncle API',
    version: '2.0.0',
    status: 'running',
  });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api', conversationRoutes);
app.use('/api', messageRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API Error]', err);

  res.status(500).json({
    error: config.isDev ? err.message : 'Internal Server Error',
    ...(config.isDev && { stack: err.stack }),
  });
});

// ============================================
// STARTUP
// ============================================

async function start() {
  console.log('🚀 Starting ChatUncle API v2...');

  // Validate configuration
  validateConfig();

  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected && config.isProd) {
    console.error('❌ Database connection failed. Exiting.');
    process.exit(1);
  }

  // Initialize Socket.io
  initializeSocket(httpServer);
  console.log('🔌 Socket.io initialized');

  // Initialize channel router
  const router = getChannelRouter();
  await router.initialize({});

  // Register QR code broadcast handler - convert QR string to data URL
  router.onQR(async (accountId, qrCode) => {
    try {
      // Convert QR string to data URL for frontend display
      const qrDataUrl = await QRCode.toDataURL(qrCode, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      console.log(`[App] Broadcasting QR code for ${accountId}`);
      broadcastQRUpdate(accountId, qrDataUrl);
    } catch (error) {
      console.error(`[App] Failed to generate QR code for ${accountId}:`, error);
    }
  });

  console.log('📱 Channel router initialized');

  // Initialize deduplication service
  getDeduplicator();
  console.log('🔄 Deduplication service initialized');

  // Start HTTP server
  httpServer.listen(config.port, () => {
    console.log(`\n✅ ChatUncle API v2 running on port ${config.port}`);
    console.log(`   Environment: ${config.nodeEnv}`);
    console.log(`   Frontend URL: ${config.frontendUrl}`);
    console.log(`   Health check: http://localhost:${config.port}/health\n`);
  });
}

// ============================================
// SHUTDOWN
// ============================================

async function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // Destroy channel router (disconnects all sessions)
  destroyChannelRouter();

  // Close database pool
  await closePool();

  // Close HTTP server
  httpServer.close(() => {
    console.log('👋 HTTP server closed');
    process.exit(0);
  });

  // Force exit after 30 seconds
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
