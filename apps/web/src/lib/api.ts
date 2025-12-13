import axios, { AxiosInstance, AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: `${API_URL}/api`,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          this.token = null;
          if (typeof window !== 'undefined') {
            localStorage.removeItem('auth_token');
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  setToken(token: string | null) {
    this.token = token;
  }

  // Auth
  async login(email: string, password: string) {
    const { data } = await this.client.post('/auth/login', { email, password });
    return data;
  }

  async register(email: string, password: string, name: string) {
    const { data } = await this.client.post('/auth/register', { email, password, name });
    return data;
  }

  async getMe() {
    const { data } = await this.client.get('/auth/me');
    return data;
  }

  // Accounts
  async getAccounts() {
    const { data } = await this.client.get('/accounts');
    return data;
  }

  async createAccount(channelType: string, phoneNumber?: string) {
    const { data } = await this.client.post('/accounts', { channelType, phoneNumber });
    return data;
  }

  async getAccount(accountId: string) {
    const { data } = await this.client.get(`/accounts/${accountId}`);
    return data;
  }

  async connectAccount(accountId: string) {
    const { data } = await this.client.post(`/accounts/${accountId}/connect`);
    return data;
  }

  async connectWithPairingCode(accountId: string, phoneNumber: string) {
    const { data } = await this.client.post(`/accounts/${accountId}/connect/pairing-code`, { phoneNumber });
    return data;
  }

  async disconnectAccount(accountId: string) {
    const { data } = await this.client.post(`/accounts/${accountId}/disconnect`);
    return data;
  }

  // Conversations
  async getConversations(accountId: string, params?: {
    page?: number;
    limit?: number;
    isGroup?: boolean;
    unreadOnly?: boolean;
  }) {
    const { data } = await this.client.get(`/accounts/${accountId}/conversations`, { params });
    return data;
  }

  // Unified Inbox - all accounts
  async getInbox(params?: {
    page?: number;
    limit?: number;
    isGroup?: boolean;
    unreadOnly?: boolean;
    channelType?: string;
    assignedAgentId?: string;
  }) {
    const { data } = await this.client.get('/inbox', { params });
    return data;
  }

  // Assign agent to conversation
  async assignConversation(conversationId: string, agentId: string | null) {
    const { data } = await this.client.patch(`/conversations/${conversationId}/assign`, { agentId });
    return data;
  }

  async getConversation(conversationId: string) {
    const { data } = await this.client.get(`/conversations/${conversationId}`);
    return data;
  }

  async markConversationRead(conversationId: string) {
    const { data } = await this.client.post(`/conversations/${conversationId}/read`);
    return data;
  }

  // Messages
  async getMessages(conversationId: string, params?: {
    limit?: number;
    before?: string;
    after?: string;
  }) {
    const { data } = await this.client.get(`/conversations/${conversationId}/messages`, { params });
    return data;
  }

  async sendMessage(conversationId: string, message: {
    contentType: string;
    content?: string;
    mediaUrl?: string;
    mediaMimeType?: string;
    replyToMessageId?: string;
    tempId?: string;
  }) {
    const { data } = await this.client.post(`/conversations/${conversationId}/messages`, message);
    return data;
  }

  // Contacts
  async getContacts(accountId: string, params?: {
    page?: number;
    limit?: number;
    search?: string;
    labelId?: string;
  }) {
    const { data } = await this.client.get(`/accounts/${accountId}/contacts`, { params });
    return data;
  }

  async getContact(contactId: string) {
    const { data } = await this.client.get(`/contacts/${contactId}`);
    return data;
  }

  async updateContact(contactId: string, updates: { name?: string }) {
    const { data } = await this.client.patch(`/contacts/${contactId}`, updates);
    return data;
  }

  // Notes
  async getContactNotes(contactId: string) {
    const { data } = await this.client.get(`/contacts/${contactId}/notes`);
    return data;
  }

  async createNote(contactId: string, content: string) {
    const { data } = await this.client.post(`/contacts/${contactId}/notes`, { content });
    return data;
  }

  async updateNote(noteId: string, content: string) {
    const { data } = await this.client.patch(`/notes/${noteId}`, { content });
    return data;
  }

  async deleteNote(noteId: string) {
    const { data } = await this.client.delete(`/notes/${noteId}`);
    return data;
  }

  // Labels
  async getLabels(accountId: string) {
    const { data } = await this.client.get(`/accounts/${accountId}/labels`);
    return data;
  }

  async createLabel(accountId: string, label: { name: string; color?: string }) {
    const { data } = await this.client.post(`/accounts/${accountId}/labels`, label);
    return data;
  }

  async updateLabel(labelId: string, updates: { name?: string; color?: string }) {
    const { data } = await this.client.patch(`/labels/${labelId}`, updates);
    return data;
  }

  async deleteLabel(labelId: string) {
    const { data } = await this.client.delete(`/labels/${labelId}`);
    return data;
  }

  async addLabelToContact(contactId: string, labelId: string) {
    const { data } = await this.client.post(`/contacts/${contactId}/labels/${labelId}`);
    return data;
  }

  async removeLabelFromContact(contactId: string, labelId: string) {
    const { data } = await this.client.delete(`/contacts/${contactId}/labels/${labelId}`);
    return data;
  }

  // Team Management
  async getAccountAgents(accountId: string) {
    const { data } = await this.client.get(`/accounts/${accountId}/agents`);
    return data;
  }

  async addAccountAgent(accountId: string, email: string, role: string) {
    const { data } = await this.client.post(`/accounts/${accountId}/agents`, { email, role });
    return data;
  }

  async removeAccountAgent(accountId: string, agentId: string) {
    const { data } = await this.client.delete(`/accounts/${accountId}/agents/${agentId}`);
    return data;
  }
}

export const api = new ApiClient();
