import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  NewMessageEvent,
} from '@chatuncle/shared';
import { config } from '../config/env.js';
import { SOCKET_CONFIG } from '../config/constants.js';
import { verifyToken } from '../modules/auth/service.js';
import { getUserAccountAccess } from '../modules/accounts/access.js';

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

let io: TypedServer | null = null;

/**
 * Initialize Socket.io server with typed events
 */
export function initializeSocket(httpServer: HttpServer): TypedServer {
  io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: SOCKET_CONFIG.PING_INTERVAL_MS,
    pingTimeout: SOCKET_CONFIG.PING_TIMEOUT_MS,
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = verifyToken(token);
      if (!payload) {
        return next(new Error('Invalid token'));
      }

      // Get user's account access
      const accountIds = await getUserAccountAccess(payload.userId);

      // Store user data on socket
      socket.data.userId = payload.userId;
      socket.data.userName = payload.name || 'Unknown';
      socket.data.accountIds = accountIds;

      next();
    } catch (error) {
      console.error('[Socket] Auth error:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket: TypedSocket) => {
    console.log(`[Socket] Connected: ${socket.data.userId} (${socket.id})`);

    // Join personal room
    socket.join(`${SOCKET_CONFIG.ROOM_USER}${socket.data.userId}`);

    // Handle account room joins
    socket.on('join:account', async (data) => {
      const { accountId } = data;

      // Verify access
      if (!socket.data.accountIds.includes(accountId)) {
        socket.emit('room:error', { accountId, error: 'Access denied' });
        return;
      }

      socket.join(`${SOCKET_CONFIG.ROOM_ACCOUNT}${accountId}`);
      socket.emit('room:joined', { accountId });
      console.log(`[Socket] ${socket.data.userId} joined account:${accountId}`);
    });

    // Handle account room leaves
    socket.on('leave:account', (data) => {
      const { accountId } = data;
      socket.leave(`${SOCKET_CONFIG.ROOM_ACCOUNT}${accountId}`);
      console.log(`[Socket] ${socket.data.userId} left account:${accountId}`);
    });

    // Handle typing indicators
    socket.on('typing:start', (data) => {
      // Broadcast to others in account room (exclude sender)
      socket.to(`${SOCKET_CONFIG.ROOM_ACCOUNT}${data.accountId}`).emit('typing:update', {
        conversationId: data.conversationId,
        accountId: data.accountId,
        userId: socket.data.userId,
        userName: socket.data.userName,
        isTyping: true,
      });
    });

    socket.on('typing:stop', (data) => {
      socket.to(`${SOCKET_CONFIG.ROOM_ACCOUNT}${data.accountId}`).emit('typing:update', {
        conversationId: data.conversationId,
        accountId: data.accountId,
        userId: socket.data.userId,
        userName: socket.data.userName,
        isTyping: false,
      });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${socket.data.userId} (${reason})`);
    });
  });

  console.log('[Socket] Server initialized');
  return io;
}

/**
 * Get the Socket.io server instance
 */
export function getIO(): TypedServer {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}

// ============================================
// BROADCAST HELPERS
// ============================================

/**
 * Broadcast new message to account room
 * IMPORTANT: Use socket.to() to exclude sender
 */
export function broadcastNewMessage(
  accountId: string,
  event: NewMessageEvent,
  excludeSocketId?: string
): void {
  const server = getIO();
  const room = `${SOCKET_CONFIG.ROOM_ACCOUNT}${accountId}`;

  if (excludeSocketId) {
    // Broadcast to all except sender
    server.to(room).except(excludeSocketId).emit('message:new', event);
  } else {
    // Broadcast to all
    server.to(room).emit('message:new', event);
  }
}

/**
 * Send message confirmation to specific socket
 */
export function sendMessageSent(
  socketId: string,
  data: { tempId: string; message: any }
): void {
  const server = getIO();
  server.to(socketId).emit('message:sent', data);
}

/**
 * Broadcast message status update
 */
export function broadcastMessageStatus(
  accountId: string,
  data: { messageId: string; status: string; error?: string }
): void {
  const server = getIO();
  server.to(`${SOCKET_CONFIG.ROOM_ACCOUNT}${accountId}`).emit('message:status', {
    messageId: data.messageId,
    status: data.status as any,
    error: data.error,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast account status change
 */
export function broadcastAccountStatus(
  accountId: string,
  status: 'connected' | 'connecting' | 'disconnected' | 'qr_required' | 'error',
  error?: string
): void {
  const server = getIO();
  server.to(`${SOCKET_CONFIG.ROOM_ACCOUNT}${accountId}`).emit('account:status', {
    accountId,
    status,
    error,
  });
}

/**
 * Broadcast QR code update
 */
export function broadcastQRUpdate(accountId: string, qrCode: string): void {
  const server = getIO();
  server.to(`${SOCKET_CONFIG.ROOM_ACCOUNT}${accountId}`).emit('qr:update', {
    accountId,
    qrCode,
    expiresAt: new Date(Date.now() + 60000).toISOString(), // 1 minute
  });
}

/**
 * Broadcast sync progress
 */
export function broadcastSyncProgress(
  accountId: string,
  type: 'history' | 'contacts' | 'groups',
  progress: number,
  total?: number,
  processed?: number
): void {
  const server = getIO();
  server.to(`${SOCKET_CONFIG.ROOM_ACCOUNT}${accountId}`).emit('sync:progress', {
    accountId,
    type,
    progress,
    total,
    processed,
  });
}

/**
 * Broadcast history sync progress
 */
export function broadcastHistorySyncProgress(
  accountId: string,
  phase: 'contacts' | 'groups' | 'messages' | 'complete',
  processed: number,
  total: number,
  percentage: number
): void {
  const server = getIO();
  server.to(`${SOCKET_CONFIG.ROOM_ACCOUNT}${accountId}`).emit('sync:progress', {
    accountId,
    type: (phase === 'complete' ? 'history' : phase) as 'contacts' | 'groups' | 'history',
    progress: percentage,
    total,
    processed,
  });
}

/**
 * Broadcast metadata sync progress (groups, profiles)
 */
export function broadcastMetadataSyncProgress(
  accountId: string,
  type: 'groups' | 'profiles' | 'contacts',
  processed: number,
  total: number,
  percentage: number
): void {
  const server = getIO();
  server.to(`${SOCKET_CONFIG.ROOM_ACCOUNT}${accountId}`).emit('sync:progress', {
    accountId,
    type: type as 'contacts' | 'groups' | 'history',
    progress: percentage,
    total,
    processed,
  });
}

/**
 * Send to specific user's personal room
 */
export function sendToUser(userId: string, event: keyof ServerToClientEvents, data: any): void {
  const server = getIO();
  server.to(`${SOCKET_CONFIG.ROOM_USER}${userId}`).emit(event, data);
}

/**
 * Get connected sockets for an account room
 */
export async function getAccountRoomSockets(accountId: string): Promise<string[]> {
  const server = getIO();
  const sockets = await server.in(`${SOCKET_CONFIG.ROOM_ACCOUNT}${accountId}`).fetchSockets();
  return sockets.map(s => s.id);
}
