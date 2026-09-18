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
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async (filter = 'all') => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getNotifications({ filter, limit: 30 });
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      // silent fail - the next realtime event or reconnect resync recovers
    } finally {
      setLoading(false);
    }
  }, [user]);

  const refreshUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getUnreadCount();
      setUnreadCount(data.unreadCount);
    } catch (err) {
      // silent fail
    }
  }, [user]);

  const markAsRead = useCallback(async (id) => {
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await markNotificationAsRead(id);
    } catch (err) {
      // resync on failure
      refreshUnreadCount();
    }
  }, [refreshUnreadCount]);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await markAllNotificationsAsRead();
    } catch (err) {
      refreshUnreadCount();
    }
  }, [refreshUnreadCount]);

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
    } catch (err) {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
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
      }
    };
    s.on('v1.notification.unread', onUnread);
    const offConnect = onSocketConnect(() => {
      refreshUnreadCount();
    });
    return () => {
      s.off('v1.notification.unread', onUnread);
      offConnect();
    };
  }, [user, refreshUnreadCount]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        fetchNotifications,
        refreshUnreadCount,
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