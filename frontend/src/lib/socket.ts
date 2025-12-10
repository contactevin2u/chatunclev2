import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'https://chatuncle-api.onrender.com';

let socket: Socket | null = null;
let joinedRooms: Set<string> = new Set();
let connectionListeners: ((connected: boolean) => void)[] = [];

export function getSocket(token: string): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      // Reconnection settings for reliability
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected, id:', socket?.id);
      notifyConnectionListeners(true);

      // Auto-rejoin all previously joined rooms on reconnect
      if (joinedRooms.size > 0) {
        console.log('[Socket] Rejoining', joinedRooms.size, 'rooms after reconnect');
        joinedRooms.forEach(accountId => {
          socket?.emit('join:account', accountId);
        });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      notifyConnectionListeners(false);
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      notifyConnectionListeners(false);
    });

    // Server acknowledgment of room join
    socket.on('room:joined', (data: { room: string }) => {
      console.log('[Socket] Joined room:', data.room);
    });
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    joinedRooms.clear();
  }
}

// Track joined rooms for auto-rejoin on reconnect
export function trackJoinedRoom(accountId: string): void {
  joinedRooms.add(accountId);
}

export function trackLeftRoom(accountId: string): void {
  joinedRooms.delete(accountId);
}

// Get current connection status
export function isSocketConnected(): boolean {
  return socket?.connected || false;
}

// Subscribe to connection status changes
export function onConnectionChange(listener: (connected: boolean) => void): () => void {
  connectionListeners.push(listener);
  // Immediately notify of current state
  listener(isSocketConnected());
  // Return unsubscribe function
  return () => {
    connectionListeners = connectionListeners.filter(l => l !== listener);
  };
}

function notifyConnectionListeners(connected: boolean): void {
  connectionListeners.forEach(listener => listener(connected));
}
