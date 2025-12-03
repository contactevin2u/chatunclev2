const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://chatuncle-api.onrender.com';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: any;
  token?: string | null;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_URL}${endpoint}`, config);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// Auth
export const auth = {
  login: (email: string, password: string) =>
    request<{ user: any; token: string }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    }),

  register: (email: string, password: string, name: string) =>
    request<{ user: any; token: string }>('/api/auth/register', {
      method: 'POST',
      body: { email, password, name },
    }),

  me: (token: string) =>
    request<{ user: any }>('/api/auth/me', { token }),
};

// WhatsApp Accounts
export const accounts = {
  list: (token: string) =>
    request<{ accounts: any[] }>('/api/accounts', { token }),

  create: (token: string, name?: string) =>
    request<{ account: any }>('/api/accounts', {
      method: 'POST',
      body: { name },
      token,
    }),

  delete: (token: string, id: string) =>
    request<{ message: string }>(`/api/accounts/${id}`, {
      method: 'DELETE',
      token,
    }),

  reconnect: (token: string, id: string) =>
    request<{ message: string }>(`/api/accounts/${id}/reconnect`, {
      method: 'POST',
      token,
    }),
};

// Conversations
export const conversations = {
  list: (token: string, accountId?: string) =>
    request<{ conversations: any[] }>(
      `/api/conversations${accountId ? `?accountId=${accountId}` : ''}`,
      { token }
    ),

  get: (token: string, id: string) =>
    request<{ conversation: any }>(`/api/conversations/${id}`, { token }),

  markRead: (token: string, id: string) =>
    request<{ message: string }>(`/api/conversations/${id}/read`, {
      method: 'PATCH',
      token,
    }),
};

// Messages
export const messages = {
  list: (token: string, conversationId: string, before?: string) =>
    request<{ messages: any[] }>(
      `/api/messages/conversation/${conversationId}${before ? `?before=${before}` : ''}`,
      { token }
    ),

  send: (token: string, conversationId: string, content: string, contentType = 'text') =>
    request<{ message: any }>(`/api/messages/conversation/${conversationId}`, {
      method: 'POST',
      body: { content, contentType },
      token,
    }),
};

// Contacts
export const contacts = {
  list: (token: string, params?: { accountId?: string; labelId?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.accountId) searchParams.set('accountId', params.accountId);
    if (params?.labelId) searchParams.set('labelId', params.labelId);
    if (params?.search) searchParams.set('search', params.search);
    const query = searchParams.toString();
    return request<{ contacts: any[] }>(`/api/contacts${query ? `?${query}` : ''}`, { token });
  },

  update: (token: string, id: string, data: { name?: string }) =>
    request<{ contact: any }>(`/api/contacts/${id}`, {
      method: 'PATCH',
      body: data,
      token,
    }),

  addLabel: (token: string, id: string, labelId: string) =>
    request<{ message: string }>(`/api/contacts/${id}/labels`, {
      method: 'POST',
      body: { labelId },
      token,
    }),

  removeLabel: (token: string, id: string, labelId: string) =>
    request<{ message: string }>(`/api/contacts/${id}/labels/${labelId}`, {
      method: 'DELETE',
      token,
    }),
};

// Labels
export const labels = {
  list: (token: string) =>
    request<{ labels: any[] }>('/api/labels', { token }),

  create: (token: string, name: string, color?: string) =>
    request<{ label: any }>('/api/labels', {
      method: 'POST',
      body: { name, color },
      token,
    }),

  update: (token: string, id: string, data: { name?: string; color?: string }) =>
    request<{ label: any }>(`/api/labels/${id}`, {
      method: 'PATCH',
      body: data,
      token,
    }),

  delete: (token: string, id: string) =>
    request<{ message: string }>(`/api/labels/${id}`, {
      method: 'DELETE',
      token,
    }),
};

// Templates
export const templates = {
  list: (token: string) =>
    request<{ templates: any[] }>('/api/templates', { token }),

  create: (token: string, name: string, content: string, shortcut?: string) =>
    request<{ template: any }>('/api/templates', {
      method: 'POST',
      body: { name, content, shortcut },
      token,
    }),

  update: (token: string, id: string, data: { name?: string; content?: string; shortcut?: string }) =>
    request<{ template: any }>(`/api/templates/${id}`, {
      method: 'PATCH',
      body: data,
      token,
    }),

  delete: (token: string, id: string) =>
    request<{ message: string }>(`/api/templates/${id}`, {
      method: 'DELETE',
      token,
    }),
};

// Admin
export const admin = {
  listAgents: (token: string) =>
    request<{ agents: any[] }>('/api/admin/agents', { token }),

  createAgent: (token: string, email: string, password: string, name: string, role?: string) =>
    request<{ agent: any }>('/api/admin/agents', {
      method: 'POST',
      body: { email, password, name, role },
      token,
    }),

  updateAgent: (token: string, id: string, data: { name?: string; role?: string; password?: string }) =>
    request<{ agent: any }>(`/api/admin/agents/${id}`, {
      method: 'PATCH',
      body: data,
      token,
    }),

  deleteAgent: (token: string, id: string) =>
    request<{ message: string }>(`/api/admin/agents/${id}`, {
      method: 'DELETE',
      token,
    }),

  listConversations: (token: string, agentId?: string) =>
    request<{ conversations: any[] }>(
      `/api/admin/conversations${agentId ? `?agentId=${agentId}` : ''}`,
      { token }
    ),

  getStats: (token: string) =>
    request<{ stats: any }>('/api/admin/stats', { token }),
};
