'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket } from '@/lib/socket';
import { useAuth } from './useAuth';

interface SocketEvents {
  onNewMessage?: (data: any) => void;
  onMessageStatus?: (data: any) => void;
  onMessageReaction?: (data: any) => void;
  onAccountStatus?: (data: any) => void;
  onQrUpdate?: (data: any) => void;
  onSyncProgress?: (data: any) => void;
  onAchievement?: (data: any) => void;
  onOrderOpsResult?: (data: any) => void;
}

export function useSocket(events: SocketEvents = {}) {
  const { token } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;

    const socket = getSocket(token);
    socketRef.current = socket;

    if (events.onNewMessage) {
      socket.on('message:new', events.onNewMessage);
    }

    if (events.onMessageStatus) {
      socket.on('message:status', events.onMessageStatus);
    }

    if (events.onMessageReaction) {
      socket.on('message:reaction', events.onMessageReaction);
    }

    if (events.onAccountStatus) {
      socket.on('account:status', events.onAccountStatus);
    }

    if (events.onQrUpdate) {
      socket.on('qr:update', events.onQrUpdate);
    }

    if (events.onSyncProgress) {
      socket.on('sync:progress', events.onSyncProgress);
    }

    if (events.onAchievement) {
      socket.on('gamification:achievement', events.onAchievement);
    }

    if (events.onOrderOpsResult) {
      socket.on('orderops:result', events.onOrderOpsResult);
    }

    return () => {
      if (events.onNewMessage) {
        socket.off('message:new', events.onNewMessage);
      }
      if (events.onMessageStatus) {
        socket.off('message:status', events.onMessageStatus);
      }
      if (events.onMessageReaction) {
        socket.off('message:reaction', events.onMessageReaction);
      }
      if (events.onAccountStatus) {
        socket.off('account:status', events.onAccountStatus);
      }
      if (events.onQrUpdate) {
        socket.off('qr:update', events.onQrUpdate);
      }
      if (events.onSyncProgress) {
        socket.off('sync:progress', events.onSyncProgress);
      }
      if (events.onAchievement) {
        socket.off('gamification:achievement', events.onAchievement);
      }
      if (events.onOrderOpsResult) {
        socket.off('orderops:result', events.onOrderOpsResult);
      }
    };
  }, [token, events.onNewMessage, events.onMessageStatus, events.onMessageReaction, events.onAccountStatus, events.onQrUpdate, events.onSyncProgress, events.onAchievement, events.onOrderOpsResult]);

  const joinAccount = useCallback((accountId: string) => {
    socketRef.current?.emit('join:account', accountId);
  }, []);

  const leaveAccount = useCallback((accountId: string) => {
    socketRef.current?.emit('leave:account', accountId);
  }, []);

  const startTyping = useCallback((conversationId: string) => {
    socketRef.current?.emit('typing:start', { conversationId });
  }, []);

  const stopTyping = useCallback((conversationId: string) => {
    socketRef.current?.emit('typing:stop', { conversationId });
  }, []);

  return {
    socket: socketRef.current,
    joinAccount,
    leaveAccount,
    startTyping,
    stopTyping,
  };
}
