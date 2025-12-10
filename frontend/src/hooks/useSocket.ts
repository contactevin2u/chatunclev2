'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, trackJoinedRoom, trackLeftRoom, onConnectionChange } from '@/lib/socket';
import { useAuth } from './useAuth';

interface SocketEvents {
  onNewMessage?: (data: any) => void;
  onMessageStatus?: (data: any) => void;
  onMessageReaction?: (data: any) => void;
  onMessageEdited?: (data: any) => void;
  onAccountStatus?: (data: any) => void;
  onQrUpdate?: (data: any) => void;
  onSyncProgress?: (data: any) => void;
  onAchievement?: (data: any) => void;
  onOrderOpsResult?: (data: any) => void;
}

export function useSocket(events: SocketEvents = {}) {
  const { token } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const joinedAccountsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!token) return;

    const socket = getSocket(token);
    socketRef.current = socket;

    // Subscribe to connection status changes
    const unsubscribe = onConnectionChange(setIsConnected);

    if (events.onNewMessage) {
      socket.on('message:new', events.onNewMessage);
    }

    if (events.onMessageStatus) {
      socket.on('message:status', events.onMessageStatus);
    }

    if (events.onMessageReaction) {
      socket.on('message:reaction', events.onMessageReaction);
    }

    if (events.onMessageEdited) {
      socket.on('message:edited', events.onMessageEdited);
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
      unsubscribe();
      if (events.onNewMessage) {
        socket.off('message:new', events.onNewMessage);
      }
      if (events.onMessageStatus) {
        socket.off('message:status', events.onMessageStatus);
      }
      if (events.onMessageReaction) {
        socket.off('message:reaction', events.onMessageReaction);
      }
      if (events.onMessageEdited) {
        socket.off('message:edited', events.onMessageEdited);
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
  }, [token, events.onNewMessage, events.onMessageStatus, events.onMessageReaction, events.onMessageEdited, events.onAccountStatus, events.onQrUpdate, events.onSyncProgress, events.onAchievement, events.onOrderOpsResult]);

  const joinAccount = useCallback((accountId: string) => {
    if (joinedAccountsRef.current.has(accountId)) {
      return; // Already joined
    }
    socketRef.current?.emit('join:account', accountId);
    trackJoinedRoom(accountId);
    joinedAccountsRef.current.add(accountId);
    console.log('[useSocket] Joined account room:', accountId);
  }, []);

  const leaveAccount = useCallback((accountId: string) => {
    socketRef.current?.emit('leave:account', accountId);
    trackLeftRoom(accountId);
    joinedAccountsRef.current.delete(accountId);
    console.log('[useSocket] Left account room:', accountId);
  }, []);

  // Bulk join multiple accounts (more efficient)
  const joinAccounts = useCallback((accountIds: string[]) => {
    const newAccounts = accountIds.filter(id => !joinedAccountsRef.current.has(id));
    if (newAccounts.length === 0) return;

    newAccounts.forEach(accountId => {
      socketRef.current?.emit('join:account', accountId);
      trackJoinedRoom(accountId);
      joinedAccountsRef.current.add(accountId);
    });
    console.log('[useSocket] Bulk joined', newAccounts.length, 'account rooms');
  }, []);

  const startTyping = useCallback((conversationId: string) => {
    socketRef.current?.emit('typing:start', { conversationId });
  }, []);

  const stopTyping = useCallback((conversationId: string) => {
    socketRef.current?.emit('typing:stop', { conversationId });
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    joinAccount,
    leaveAccount,
    joinAccounts,
    startTyping,
    stopTyping,
  };
}
