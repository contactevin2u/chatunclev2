const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://chatuncle-api.onrender.com';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

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

  create: (token: string, name: string, content: string, shortcut?: string, options?: {
    content_type?: string;
    media_url?: string;
    media_mime_type?: string;
  }) =>
    request<{ template: any }>('/api/templates', {
      method: 'POST',
      body: { name, content, shortcut, ...options },
      token,
    }),

  update: (token: string, id: string, data: {
    name?: string;
    content?: string;
    shortcut?: string;
    content_type?: string;
    media_url?: string;
    media_mime_type?: string;
  }) =>
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

// Template Sequences (multi-part with delays)
export const templateSequences = {
  list: (token: string) =>
    request<{ sequences: any[] }>('/api/templates/sequences', { token }),

  get: (token: string, id: string) =>
    request<{ sequence: any }>(`/api/templates/sequences/${id}`, { token }),

  create: (token: string, data: {
    name: string;
    description?: string;
    shortcut?: string;
    items: Array<{
      content_type: string;
      content?: string;
      media_url?: string;
      media_mime_type?: string;
      delay_min_seconds?: number;
      delay_max_seconds?: number;
    }>;
  }) =>
    request<{ sequence: any }>('/api/templates/sequences', {
      method: 'POST',
      body: data,
      token,
    }),

  update: (token: string, id: string, data: {
    name?: string;
    description?: string;
    shortcut?: string;
    is_active?: boolean;
    items?: Array<{
      content_type: string;
      content?: string;
      media_url?: string;
      media_mime_type?: string;
      delay_min_seconds?: number;
      delay_max_seconds?: number;
    }>;
  }) =>
    request<{ sequence: any }>(`/api/templates/sequences/${id}`, {
      method: 'PATCH',
      body: data,
      token,
    }),

  delete: (token: string, id: string) =>
    request<{ message: string }>(`/api/templates/sequences/${id}`, {
      method: 'DELETE',
      token,
    }),

  execute: (token: string, id: string, conversationId: string) =>
    request<{ message: string; sequenceId: string; conversationId: string }>(
      `/api/templates/sequences/${id}/execute`,
      {
        method: 'POST',
        body: { conversationId },
        token,
      }
    ),
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

// Analytics
export const analytics = {
  getOverview: (token: string, params?: { accountId?: string; startDate?: string; endDate?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.accountId) searchParams.set('accountId', params.accountId);
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    const query = searchParams.toString();
    return request<{ overview: any }>(`/api/analytics/overview${query ? `?${query}` : ''}`, { token });
  },

  getByAgent: (token: string, params?: { startDate?: string; endDate?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    const query = searchParams.toString();
    return request<{ agents: any[] }>(`/api/analytics/by-agent${query ? `?${query}` : ''}`, { token });
  },

  getByDay: (token: string, params?: { accountId?: string; days?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.accountId) searchParams.set('accountId', params.accountId);
    if (params?.days) searchParams.set('days', params.days.toString());
    const query = searchParams.toString();
    return request<{ days: any[] }>(`/api/analytics/by-day${query ? `?${query}` : ''}`, { token });
  },

  getHourlyActivity: (token: string, accountId?: string) => {
    const query = accountId ? `?accountId=${accountId}` : '';
    return request<{ hours: any[] }>(`/api/analytics/hourly-activity${query}`, { token });
  },

  getChatStats: (token: string, params?: { accountId?: string; startDate?: string; endDate?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.accountId) searchParams.set('accountId', params.accountId);
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    const query = searchParams.toString();
    return request<{
      new_contacts: number;
      existing_contacts: number;
      total_conversations: number;
      total_messages: number;
      messages_sent: number;
      messages_received: number;
      daily_breakdown: any[];
    }>(`/api/analytics/chat-stats${query ? `?${query}` : ''}`, { token });
  },
};

// Scheduled Messages
export const scheduledMessages = {
  list: (token: string, conversationId?: string) => {
    const query = conversationId ? `?conversationId=${conversationId}` : '';
    return request<{ scheduledMessages: any[] }>(`/api/scheduled-messages${query}`, { token });
  },

  create: (token: string, data: {
    conversationId: string;
    content: string;
    contentType?: string;
    scheduledAt: string;
    mediaUrl?: string;
    mediaMimeType?: string;
  }) =>
    request<{ scheduledMessage: any }>('/api/scheduled-messages', {
      method: 'POST',
      body: data,
      token,
    }),

  cancel: (token: string, id: string) =>
    request<{ scheduledMessage: any }>(`/api/scheduled-messages/${id}/cancel`, {
      method: 'POST',
      token,
    }),

  delete: (token: string, id: string) =>
    request<{ success: boolean }>(`/api/scheduled-messages/${id}`, {
      method: 'DELETE',
      token,
    }),
};

// Internal Notes
export const notes = {
  list: (token: string, conversationId: string) =>
    request<{ notes: any[] }>(`/api/notes/conversation/${conversationId}`, { token }),

  create: (token: string, conversationId: string, content: string) =>
    request<{ note: any }>(`/api/notes/conversation/${conversationId}`, {
      method: 'POST',
      body: { content },
      token,
    }),

  update: (token: string, id: string, content: string) =>
    request<{ note: any }>(`/api/notes/${id}`, {
      method: 'PATCH',
      body: { content },
      token,
    }),

  delete: (token: string, id: string) =>
    request<{ success: boolean }>(`/api/notes/${id}`, {
      method: 'DELETE',
      token,
    }),
};

// Auto-Reply Rules
export const autoReply = {
  list: (token: string, accountId?: string) => {
    const query = accountId ? `?accountId=${accountId}` : '';
    return request<{ rules: any[] }>(`/api/auto-reply${query}`, { token });
  },

  get: (token: string, id: string) =>
    request<{ rule: any }>(`/api/auto-reply/${id}`, { token }),

  create: (token: string, data: {
    name: string;
    whatsappAccountId?: string;
    triggerType?: 'keyword' | 'regex' | 'all';
    triggerKeywords?: string[];
    triggerRegex?: string;
    responseType?: 'text' | 'template';
    responseContent?: string;
    responseTemplateId?: string;
    useAi?: boolean;
    aiPrompt?: string;
    priority?: number;
  }) =>
    request<{ rule: any }>('/api/auto-reply', {
      method: 'POST',
      body: data,
      token,
    }),

  update: (token: string, id: string, data: any) =>
    request<{ rule: any }>(`/api/auto-reply/${id}`, {
      method: 'PATCH',
      body: data,
      token,
    }),

  toggle: (token: string, id: string) =>
    request<{ rule: any }>(`/api/auto-reply/${id}/toggle`, {
      method: 'POST',
      token,
    }),

  delete: (token: string, id: string) =>
    request<{ success: boolean }>(`/api/auto-reply/${id}`, {
      method: 'DELETE',
      token,
    }),

  test: (token: string, id: string, message: string) =>
    request<{ matches: boolean; rule_name: string; would_respond: boolean; response_preview: string | null }>(
      `/api/auto-reply/${id}/test`,
      {
        method: 'POST',
        body: { message },
        token,
      }
    ),
};

// Search
export const search = {
  global: (token: string, query: string, params?: { accountId?: string; limit?: number }) => {
    const searchParams = new URLSearchParams({ q: query });
    if (params?.accountId) searchParams.set('accountId', params.accountId);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    return request<{ results: any[] }>(`/api/search?${searchParams.toString()}`, { token });
  },

  conversation: (token: string, conversationId: string, query: string) =>
    request<{ messages: any[] }>(`/api/search/conversation/${conversationId}?q=${encodeURIComponent(query)}`, { token }),
};

// Activity Logs
export const activityLogs = {
  list: (token: string, params?: { agentId?: string; actionType?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.agentId) searchParams.set('agentId', params.agentId);
    if (params?.actionType) searchParams.set('actionType', params.actionType);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
    const query = searchParams.toString();
    return request<{ logs: any[]; total: number }>(`/api/activity-logs${query ? `?${query}` : ''}`, { token });
  },

  getMyActivity: (token: string, limit?: number) => {
    const query = limit ? `?limit=${limit}` : '';
    return request<{ logs: any[] }>(`/api/activity-logs/me${query}`, { token });
  },
};

// Account Settings (extended)
export const accountSettings = {
  update: (token: string, id: string, data: {
    name?: string;
    incognitoMode?: boolean;
    showChannelName?: boolean;
    channelDisplayName?: string;
  }) =>
    request<{ account: any }>(`/api/accounts/${id}`, {
      method: 'PATCH',
      body: data,
      token,
    }),

  getAntiBanStats: (token: string, id: string) =>
    request<{ stats: any; config: any; recommendations: string[] }>(`/api/accounts/${id}/anti-ban-stats`, { token }),
};

// Contacts (extended with import/export)
export const contactsExtended = {
  ...contacts,

  export: (token: string, accountId: string) =>
    `${API_URL}/api/contacts/export?accountId=${accountId}&token=${token}`,

  import: async (token: string, accountId: string, file: File, defaultLabels?: string[]) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('accountId', accountId);
    if (defaultLabels) {
      formData.append('defaultLabels', JSON.stringify(defaultLabels));
    }

    const response = await fetch(`${API_URL}/api/contacts/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Import failed' }));
      throw new Error(error.error || 'Import failed');
    }

    return response.json();
  },

  bulkLabel: (token: string, contactIds: string[], labelId: string) =>
    request<{ success: boolean; updated: number }>('/api/contacts/bulk-label', {
      method: 'POST',
      body: { contactIds, labelId },
      token,
    }),

  bulkUnlabel: (token: string, contactIds: string[], labelId: string) =>
    request<{ success: boolean; updated: number }>('/api/contacts/bulk-unlabel', {
      method: 'POST',
      body: { contactIds, labelId },
      token,
    }),
};


// Media Upload
export const media = {
  upload: async (token: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/api/media/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }

    return response.json() as Promise<{ url: string; mimeType: string; filename: string; size: number }>;
  },

  uploadVoice: async (token: string, audioBlob: Blob, duration?: number) => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'voice-note.webm');
    if (duration) {
      formData.append('duration', duration.toString());
    }

    const response = await fetch(`${API_URL}/api/media/upload-voice`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }

    return response.json() as Promise<{ url: string; mimeType: string; duration?: number }>;
  },
};

// Knowledge Bank & AI Settings
export const knowledge = {
  // AI Settings
  getSettings: (token: string, accountId: string) =>
    request<{ settings: any }>(`/api/knowledge/settings/${accountId}`, { token }),

  updateSettings: (token: string, accountId: string, settings: {
    enabled?: boolean;
    auto_reply?: boolean;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    max_consecutive_replies?: number;
    custom_prompt?: string;
  }) =>
    request<{ settings: any }>(`/api/knowledge/settings/${accountId}`, {
      method: 'PUT',
      body: settings,
      token,
    }),

  // Documents
  listDocuments: (token: string, accountId: string) =>
    request<{ documents: any[] }>(`/api/knowledge/documents/${accountId}`, { token }),

  uploadDocument: async (token: string, accountId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/api/knowledge/documents/${accountId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }

    return response.json() as Promise<{ message: string; name: string; chunks: number }>;
  },

  addTextContent: (token: string, accountId: string, name: string, content: string) =>
    request<{ message: string; name: string; chunks: number }>(`/api/knowledge/documents/${accountId}/text`, {
      method: 'POST',
      body: { name, content },
      token,
    }),

  deleteDocument: (token: string, accountId: string, documentId: string) =>
    request<{ message: string }>(`/api/knowledge/documents/${accountId}/${documentId}`, {
      method: 'DELETE',
      token,
    }),

  // AI Logs
  getLogs: (token: string, accountId: string, limit?: number) =>
    request<{ logs: any[] }>(`/api/knowledge/logs/${accountId}${limit ? `?limit=${limit}` : ''}`, { token }),
};

// OrderOps integration - send messages for order parsing
export const orderops = {
  // Parse message into order
  parseMessage: (token: string, messageId: string, conversationId: string) =>
    request<{ success: boolean; result: any; message: string }>('/api/orderops/parse', {
      method: 'POST',
      body: { messageId, conversationId },
      token,
    }),

  // Parse as quotation only
  parseQuotation: (token: string, messageId: string) =>
    request<{ success: boolean; result: any }>('/api/orderops/quotation', {
      method: 'POST',
      body: { messageId },
      token,
    }),

  // Get orders linked to a contact
  getContactOrders: (token: string, contactId: string) =>
    request<{ success: boolean; orders: any[] }>(`/api/orderops/contact/${contactId}/orders`, { token }),

  // Get order details from OrderOps
  getOrder: (token: string, orderId: number) =>
    request<{ success: boolean; order: any }>(`/api/orderops/order/${orderId}`, { token }),
};

// Re-export API_URL for use in other places
export { API_URL };
