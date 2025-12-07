import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { JwtPayload } from '../types';

let io: Server;

export function initializeSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc)
        if (!origin) return callback(null, true);

        // Normalize origins by removing trailing slashes
        const normalizedOrigin = origin.replace(/\/$/, '');

        // Allow in development
        if (config.nodeEnv === 'development') {
          return callback(null, true);
        }

        // Allow chatuncle domains
        if (normalizedOrigin.includes('chatuncle.my') || normalizedOrigin.includes('chatuncle')) {
          return callback(null, true);
        }

        // Allow Vercel domains (production and preview)
        if (normalizedOrigin.includes('vercel.app')) {
          return callback(null, true);
        }

        // Allow localhost for development
        if (normalizedOrigin.includes('localhost')) {
          return callback(null, true);
        }

        // Allow configured origin
        const allowedOrigin = config.corsOrigin.replace(/\/$/, '');
        if (normalizedOrigin === allowedOrigin) {
          return callback(null, true);
        }

        console.log(`[Socket] CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
      socket.data.user = decoded;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as JwtPayload;
    console.log(`User ${user.email} connected via Socket.io`);

    // Join user's personal room for notifications
    socket.join(`user:${user.userId}`);

    // Join specific account rooms
    socket.on('join:account', (accountId: string) => {
      socket.join(`account:${accountId}`);
      console.log(`User ${user.email} joined account room ${accountId}`);
    });

    socket.on('leave:account', (accountId: string) => {
      socket.leave(`account:${accountId}`);
      console.log(`User ${user.email} left account room ${accountId}`);
    });

    // Typing indicators
    socket.on('typing:start', (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit('typing:start', {
        userId: user.userId,
        conversationId: data.conversationId,
      });
    });

    socket.on('typing:stop', (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit('typing:stop', {
        userId: user.userId,
        conversationId: data.conversationId,
      });
    });

    socket.on('disconnect', () => {
      console.log(`User ${user.email} disconnected`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}
