import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../utils/axios';
import { useAuth } from './AuthContext';
import { connectSocket, onSocketConnect } from '../services/socket';

const ConversationContext = createContext(null);

export const ConversationProvider = ({ children }) => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const { data } = await api.get('/conversations/unread-count');
      setUnreadCount(data?.unreadCount || 0);
    } catch (err) {
      // silent fail - the next realtime event or reconnect resync recovers
    }
  }, [user]);

  // Initial REST load on login; logout resets the badge. Live updates arrive
  // via the realtime subscription below (polling removed in Phase 10).
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    refreshUnreadCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Realtime badge (Phase 9): the server pushes the authoritative count
  // whenever conversation unread state changes. REST resync runs on every
  // (re)connect to cover missed events.
  useEffect(() => {
    if (!user) return;
    const s = connectSocket();
    if (!s) return undefined;
    const onUnread = (payload) => {
      if (payload && typeof payload.unreadCount === 'number') {
        setUnreadCount(payload.unreadCount);
      }
    };
    s.on('v1.conversation.unread', onUnread);
    const offConnect = onSocketConnect(() => {
      refreshUnreadCount();
    });
    return () => {
      s.off('v1.conversation.unread', onUnread);
      offConnect();
    };
  }, [user, refreshUnreadCount]);

  return (
    <ConversationContext.Provider value={{ unreadCount, refreshUnreadCount }}>
      {children}
    </ConversationContext.Provider>
  );
};

export const useConversations = () => useContext(ConversationContext);
