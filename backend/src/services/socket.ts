import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { JwtPayload } from '../types';

let io: Server;

// Track connected users and their rooms for debugging
const connectedUsers = new Map<string, { email: string; userId: string; rooms: Set<string> }>();

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
    // Ping timeout and interval for better connection stability
    pingTimeout: 60000,
    pingInterval: 25000,
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
    console.log(`[Socket] User ${user.email} connected (socket: ${socket.id})`);

    // Track this connection
    connectedUsers.set(socket.id, {
      email: user.email,
      userId: user.userId,
      rooms: new Set([`user:${user.userId}`]),
    });

    // Join user's personal room for notifications
    socket.join(`user:${user.userId}`);

    // Join specific account rooms with acknowledgment
    socket.on('join:account', (accountId: string) => {
      const roomName = `account:${accountId}`;
      socket.join(roomName);

      // Track room join
      const userData = connectedUsers.get(socket.id);
      if (userData) {
        userData.rooms.add(roomName);
      }

      console.log(`[Socket] User ${user.email} joined room ${roomName}`);

      // Send acknowledgment back to client
      socket.emit('room:joined', { room: roomName, accountId });
    });

    socket.on('leave:account', (accountId: string) => {
      const roomName = `account:${accountId}`;
      socket.leave(roomName);

      // Track room leave
      const userData = connectedUsers.get(socket.id);
      if (userData) {
        userData.rooms.delete(roomName);
      }

      console.log(`[Socket] User ${user.email} left room ${roomName}`);
    });

    // Typing indicators - broadcast to account room for all agents to see
    socket.on('typing:start', (data: { conversationId: string; accountId?: string }) => {
      // If accountId provided, broadcast to account room
      // Otherwise fall back to conversation room
      if (data.accountId) {
        socket.to(`account:${data.accountId}`).emit('typing:start', {
          userId: user.userId,
          userName: user.email,
          conversationId: data.conversationId,
        });
      } else {
        socket.to(`conversation:${data.conversationId}`).emit('typing:start', {
          userId: user.userId,
          conversationId: data.conversationId,
        });
      }
    });

    socket.on('typing:stop', (data: { conversationId: string; accountId?: string }) => {
      if (data.accountId) {
        socket.to(`account:${data.accountId}`).emit('typing:stop', {
          userId: user.userId,
          userName: user.email,
          conversationId: data.conversationId,
        });
      } else {
        socket.to(`conversation:${data.conversationId}`).emit('typing:stop', {
          userId: user.userId,
          conversationId: data.conversationId,
        });
      }
    });

    socket.on('disconnect', (reason) => {
      const userData = connectedUsers.get(socket.id);
      const roomCount = userData?.rooms.size || 0;
      console.log(`[Socket] User ${user.email} disconnected (reason: ${reason}, was in ${roomCount} rooms)`);
      connectedUsers.delete(socket.id);
    });

    // Handle reconnection - client will rejoin rooms automatically
    socket.on('error', (error) => {
      console.error(`[Socket] Error for user ${user.email}:`, error);
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

// Utility: Get count of users in an account room
export function getAccountRoomSize(accountId: string): number {
  const room = io?.sockets.adapter.rooms.get(`account:${accountId}`);
  return room?.size || 0;
}

// Utility: Get all connected users info (for debugging)
export function getConnectedUsersInfo(): { socketId: string; email: string; rooms: string[] }[] {
  return Array.from(connectedUsers.entries()).map(([socketId, data]) => ({
    socketId,
    email: data.email,
    rooms: Array.from(data.rooms),
  }));
}
