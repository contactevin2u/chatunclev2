import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config/env';
import { initializeSocket } from './services/socket';
import { sessionManager } from './services/whatsapp/SessionManager';

// Routes
import authRoutes from './routes/auth';
import accountsRoutes from './routes/accounts';
import conversationsRoutes from './routes/conversations';
import messagesRoutes from './routes/messages';
import contactsRoutes from './routes/contacts';
import labelsRoutes from './routes/labels';
import templatesRoutes from './routes/templates';
import adminRoutes from './routes/admin';

const app = express();
const httpServer = createServer(app);

// Initialize Socket.io
initializeSocket(httpServer);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);

    // Remove trailing slash for comparison
    const normalizedOrigin = origin.replace(/\/$/, '');
    const allowedOrigin = config.corsOrigin.replace(/\/$/, '');

    // Allow if matches or if in development
    if (normalizedOrigin === allowedOrigin || config.nodeEnv === 'development') {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
httpServer.listen(config.port, async () => {
  console.log(`Server running on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);

  // Restore WhatsApp sessions on startup
  if (config.nodeEnv !== 'test') {
    await sessionManager.restoreAllSessions();
  }
});

export default app;
