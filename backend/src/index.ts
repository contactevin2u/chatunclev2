import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config/env';
import { initializeSocket } from './services/socket';
import { sessionManager } from './services/whatsapp/SessionManager';
import { startScheduledMessageProcessor } from './services/scheduledMessageProcessor';
import { restoreTelegramSessions } from './services/channel/telegramStartup';
import { restoreTikTokSessions } from './services/channel/tiktokStartup';
import { restoreMetaSessions } from './services/channel/metaStartup';
import { securityHeaders, apiRateLimiter, sanitizeRequest, secureErrorHandler } from './middleware/security';
import { errorHandler } from './middleware/errorHandler';

// Routes
import authRoutes from './routes/auth';
import accountsRoutes from './routes/accounts';
import conversationsRoutes from './routes/conversations';
import messagesRoutes from './routes/messages';
import contactsRoutes from './routes/contacts';
import labelsRoutes from './routes/labels';
import templatesRoutes from './routes/templates';
import adminRoutes from './routes/admin';
import analyticsRoutes from './routes/analytics';
import scheduledMessagesRoutes from './routes/scheduled-messages';
import notesRoutes from './routes/notes';
import searchRoutes from './routes/search';
import autoReplyRoutes from './routes/auto-reply';
import activityLogsRoutes from './routes/activity-logs';
import aalyxRoutes from './routes/aalyx';
import mediaRoutes from './routes/media';
import knowledgeRoutes from './routes/knowledge';
import orderopsRoutes from './routes/orderops';
import groupsRoutes from './routes/groups';
import gamificationRoutes from './routes/gamification';
import telegramRoutes from './routes/telegram';
import tiktokRoutes from './routes/tiktok';
import metaRoutes from './routes/meta';

import sendToPhoneRoutes from './routes/send-to-phone';
const app = express();
const httpServer = createServer(app);

// Trust proxy - REQUIRED for Render/Vercel (reverse proxy)
// This fixes X-Forwarded-For header issues with rate limiting
app.set('trust proxy', 1);

// Initialize Socket.io
initializeSocket(httpServer);

// Security middleware - apply before other middleware
app.use(securityHeaders);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);

    // Remove trailing slash for comparison
    const normalizedOrigin = origin.replace(/\/$/, '');

    // Allow in development
    if (config.nodeEnv === 'development') {
      return callback(null, true);
    }

    // Allow chatuncle domains (production domain)
    if (normalizedOrigin.includes('chatuncle.my') || normalizedOrigin.includes('chatuncle')) {
      return callback(null, true);
    }

    // Allow Vercel domains (production and preview)
    if (normalizedOrigin.includes('vercel.app')) {
      return callback(null, true);
    }

    // Allow configured origin
    const allowedOrigin = config.corsOrigin.replace(/\/$/, '');
    if (normalizedOrigin === allowedOrigin) {
      return callback(null, true);
    }

    // Allow localhost for development
    if (normalizedOrigin.includes('localhost')) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request sanitization
app.use(sanitizeRequest);

// API rate limiting (applies to all API routes)
app.use('/api', apiRateLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/labels', labelsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/scheduled-messages', scheduledMessagesRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/auto-reply', autoReplyRoutes);
app.use('/api/activity-logs', activityLogsRoutes);
app.use('/api/aalyx', aalyxRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/orderops', orderopsRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/tiktok', tiktokRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/send-to-phone', sendToPhoneRoutes);

// Error handlers - standardized error responses
// errorHandler provides consistent API error responses with error codes
// secureErrorHandler provides production safety (doesn't expose internal details)
app.use(errorHandler);
app.use(secureErrorHandler);

// Start server
httpServer.listen(config.port, async () => {
  console.log(`Server running on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);

  // Restore sessions on startup (parallelized for faster startup)
  if (config.nodeEnv !== 'test') {
    console.log('[Startup] Restoring all channel sessions in parallel...');
    const startTime = Date.now();

    // Run all session restores in parallel for faster startup
    const results = await Promise.allSettled([
      sessionManager.restoreAllSessions().then(() => console.log('[Startup] WhatsApp sessions restored')),
      restoreTelegramSessions().then(() => console.log('[Startup] Telegram sessions restored')),
      restoreTikTokSessions().then(() => console.log('[Startup] TikTok sessions restored')),
      restoreMetaSessions().then(() => console.log('[Startup] Meta sessions restored')),
    ]);

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const channels = ['WhatsApp', 'Telegram', 'TikTok', 'Meta'];
        console.error(`[Startup] Failed to restore ${channels[index]} sessions:`, result.reason);
      }
    });

    const elapsed = Date.now() - startTime;
    console.log(`[Startup] All sessions restored in ${elapsed}ms`);

    // Start scheduled message processor
    startScheduledMessageProcessor();
  }
});

export default app;
