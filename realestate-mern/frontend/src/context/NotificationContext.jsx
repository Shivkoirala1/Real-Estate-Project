import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  getNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification as deleteNotificationRequest,
} from '../services/notificationService';
import { useAuth } from './AuthContext';
import { connectSocket, onSocketConnect } from '../services/socket';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadByCategory, setUnreadByCategory] = useState({
    messages: 0,
    visits: 0,
    deals: 0,
    management: 0,
    payments: 0,
  });
  const [loading, setLoading] = useState(false);

  const applyCounts = useCallback((data) => {
    if (typeof data?.unreadCount === 'number') setUnreadCount(data.unreadCount);
    if (data?.unreadByCategory) setUnreadByCategory((prev) => ({ ...prev, ...data.unreadByCategory }));
  }, []);

  const fetchNotifications = useCallback(async (filter = 'all', category = 'all') => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getNotifications({ filter, category, limit: 30 });
      setNotifications(data.notifications);
      applyCounts(data);
    } catch (err) {
      // silent fail - the next realtime event or reconnect resync recovers
    } finally {
      setLoading(false);
    }
  }, [user, applyCounts]);

  const refreshUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getUnreadCount();
      setUnreadCount(data.unreadCount);
    } catch (err) {
      // silent fail
    }
  }, [user]);

  // Tiny resync for per-category badges: the list payload is irrelevant at
  // limit 1, but unreadCount + unreadByCategory are recipient-wide, so one
  // cheap request refreshes every badge. Never rejects.
  const refreshUnreadState = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getNotifications({ filter: 'all', limit: 1 });
      applyCounts(data);
    } catch (err) {
      // silent fail - badges update on the next list fetch or socket event
    }
  }, [user, applyCounts]);

  const markAsRead = useCallback(async (id) => {
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await markNotificationAsRead(id);
      refreshUnreadState();
    } catch (err) {
      // resync on failure
      refreshUnreadCount();
      refreshUnreadState();
    }
  }, [refreshUnreadCount, refreshUnreadState]);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    setUnreadByCategory({ messages: 0, visits: 0, deals: 0, management: 0, payments: 0 });
    try {
      await markAllNotificationsAsRead();
      refreshUnreadState();
    } catch (err) {
      refreshUnreadCount();
      refreshUnreadState();
    }
  }, [refreshUnreadCount, refreshUnreadState]);

  const deleteNotification = useCallback(async (id) => {
    let wasUnread = false;
    setNotifications((prev) => {
      const target = prev.find((n) => n._id === id);
      wasUnread = target && !target.isRead;
      return prev.filter((n) => n._id !== id);
    });
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await deleteNotificationRequest(id);
      if (wasUnread) refreshUnreadState();
    } catch (err) {
      fetchNotifications();
    }
  }, [fetchNotifications, refreshUnreadState]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setUnreadByCategory({ messages: 0, visits: 0, deals: 0, management: 0, payments: 0 });
      return;
    }

    // Initial REST load on login. Live updates arrive via the realtime
    // subscription below (polling removed in Phase 10).
    refreshUnreadCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Realtime badge (Phase 9): the server pushes the authoritative count on
  // every new notification. REST resync runs on every (re)connect to cover
  // missed events.
  useEffect(() => {
    if (!user) return;
    const s = connectSocket();
    if (!s) return undefined;
    const onUnread = (payload) => {
      if (payload && typeof payload.unreadCount === 'number') {
        setUnreadCount(payload.unreadCount);
        // Socket carries the global count only — resync category badges.
        refreshUnreadState();
      }
    };
    s.on('v1.notification.unread', onUnread);
    const offConnect = onSocketConnect(() => {
      refreshUnreadCount();
      refreshUnreadState();
    });
    return () => {
      s.off('v1.notification.unread', onUnread);
      offConnect();
    };
  }, [user, refreshUnreadCount, refreshUnreadState]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        unreadByCategory,
        loading,
        fetchNotifications,
        refreshUnreadCount,
        refreshUnreadState,
        markAsRead,
        markAllAsRead,
        deleteNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error(
      'useNotifications must be used within NotificationProvider'
    );
  }

  return context;
};