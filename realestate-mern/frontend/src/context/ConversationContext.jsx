import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api from '../utils/axios';
import { useAuth } from './AuthContext';

const ConversationContext = createContext(null);

const POLL_INTERVAL = 30000; // 30s - keeps the conversations badge fresh

export const ConversationProvider = ({ children }) => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const pollRef = useRef(null);

  const refreshUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const { data } = await api.get('/conversations/unread-count');
      setUnreadCount(data?.unreadCount || 0);
    } catch (err) {
      // silent fail - polling will retry
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      if (pollRef.current) clearInterval(pollRef.current);
      return undefined;
    }

    refreshUnreadCount();
    pollRef.current = setInterval(refreshUnreadCount, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <ConversationContext.Provider value={{ unreadCount, refreshUnreadCount }}>
      {children}
    </ConversationContext.Provider>
  );
};

export const useConversations = () => useContext(ConversationContext);
