import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@chatuncle/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

export function getSocket(): TypedSocket | null {
  return socket;
}

export function connectSocket(token: string): TypedSocket {
  if (socket?.connected) {
    return socket;
  }

  socket = io(API_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  }) as TypedSocket;

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error.message);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinAccount(accountId: string): void {
  if (socket?.connected) {
    socket.emit('join:account', { accountId });
    console.log('[Socket] Joined account:', accountId);
  }
}

export function leaveAccount(accountId: string): void {
  if (socket?.connected) {
    socket.emit('leave:account', { accountId });
    console.log('[Socket] Left account:', accountId);
  }
}

export function emitTyping(conversationId: string): void {
  if (socket?.connected) {
    socket.emit('typing:start', { conversationId });
  }
}
