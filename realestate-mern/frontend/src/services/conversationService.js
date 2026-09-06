import api from '../utils/axios';

// ------------------------------------------------------------------
// Unified conversation service - messaging threads tied to leads,
// contact forms, or properties.
// ------------------------------------------------------------------

/**
 * Start a conversation thread.
 * POST /api/conversations
 * payload: { owner, inquirer?, property?, lead?, initialMessage }
 */
export const startConversation = async (conversationData) => {
  const { data } = await api.post('/conversations', conversationData);
  return data; // { success, message, conversation }
};

/**
 * List conversations (admin view).
 * GET /api/conversations?isActive=true|false|all
 */
export const getConversations = async (params = {}) => {
  const { data } = await api.get('/conversations', { params });
  return data; // { success, conversations, pagination }
};

/**
 * Conversations the current user participates in.
 * GET /api/conversations/my-conversations
 */
export const getMyConversations = async (params = {}) => {
  const { data } = await api.get('/conversations/my-conversations', { params });
  return data; // { success, conversations, pagination }
};

/**
 * Single thread with full message history.
 * GET /api/conversations/:id
 */
export const getConversationById = async (id) => {
  const { data } = await api.get(`/conversations/${id}`);
  return data; // { success, conversation }
};

/**
 * Append a message to a thread.
 * PATCH /api/conversations/:id/messages { message }
 */
export const addMessageToConversation = async (id, message) => {
  const { data } = await api.patch(`/conversations/${id}/messages`, { message });
  return data; // { success, message, conversation }
};

/**
 * Close / reopen a thread.
 */
export const closeConversation = async (id) => {
  const { data } = await api.patch(`/conversations/${id}/close`);
  return data;
};

export const reopenConversation = async (id) => {
  const { data } = await api.patch(`/conversations/${id}/reopen`);
  return data;
};
