'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X, User, StickyNote, Package, ChevronLeft, ChevronRight,
  Phone, Calendar, MapPin, Tag, Clock, Plus, Trash2,
  RefreshCw, ChevronDown, DollarSign, Truck,
  Send, Copy, Check, CreditCard, MessageSquare,
  Loader2, ExternalLink
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { notes as notesApi, orderops, contacts as contactsApi } from '@/lib/api';
import BottomSheet from '@/components/ui/BottomSheet';

// Types
interface Note {
  id: string;
  content: string;
  created_at: string;
  agent_name?: string;
}

interface Order {
  id: string;
  orderops_order_id: number;
  mother_order_id?: number;
  order_code: string;
  order_type: string;
  customer_name: string;
  total: string;
  balance: string;
  status: string;
  delivery_status: string;
  parsed_data: any;
  child_orders?: Order[];
  created_at: string;
}

interface ContactInfo {
  id: string;
  name: string;
  phone_number: string;
  wa_id: string;
  created_at: string;
  labels?: { id: string; name: string; color: string }[];
}

interface ContextPanelProps {
  conversationId: string;
  contactId?: string;
  onClose: () => void;
  onSendMessage?: (message: string) => void;
  isOpen: boolean;
}

type TabType = 'profile' | 'notes' | 'orders';

export default function ContextPanel({
  conversationId,
  contactId,
  onClose,
  onSendMessage,
  isOpen
}: ContextPanelProps) {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Profile state
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [isLoadingContact, setIsLoadingContact] = useState(false);

  // Notes state
  const [notesList, setNotesList] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Orders state
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load data when panel opens or conversation changes
  useEffect(() => {
    if (isOpen && conversationId) {
      loadNotes();
      loadOrders();
      if (contactId) {
        loadContact();
      }
    }
  }, [isOpen, conversationId, contactId, token]);

  // Load contact info
  const loadContact = async () => {
    if (!token || !contactId) return;
    setIsLoadingContact(true);
    try {
      const { contact: loadedContact } = await contactsApi.get(token, contactId);
      setContact(loadedContact);
    } catch (err) {
      console.error('Failed to load contact:', err);
    } finally {
      setIsLoadingContact(false);
    }
  };

  // Load notes
  const loadNotes = async () => {
    if (!token) return;
    setIsLoadingNotes(true);
    try {
      const { notes } = await notesApi.list(token, conversationId);
      setNotesList(notes || []);
    } catch (err) {
      console.error('Failed to load notes:', err);
    } finally {
      setIsLoadingNotes(false);
    }
  };

  // Load orders
  const loadOrders = async () => {
    if (!token) return;
    setIsLoadingOrders(true);
    try {
      const { orders: loadedOrders } = await orderops.getConversationOrders(token, conversationId);
      setOrders(loadedOrders || []);
      if (loadedOrders?.length > 0) {
        setExpandedOrders(new Set([loadedOrders[0].orderops_order_id]));
      }
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  // Add note
  const handleAddNote = async () => {
    if (!token || !newNote.trim()) return;
    setIsSavingNote(true);
    try {
      const { note } = await notesApi.create(token, conversationId, newNote.trim());
      setNotesList([note, ...notesList]);
      setNewNote('');
    } catch (err) {
      console.error('Failed to add note:', err);
    } finally {
      setIsSavingNote(false);
    }
  };

  // Delete note
  const handleDeleteNote = async (noteId: string) => {
    if (!token) return;
    try {
      await notesApi.delete(token, noteId);
      setNotesList(notesList.filter(n => n.id !== noteId));
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  // Link order
  const handleLinkOrder = async () => {
    if (!token || !linkInput.trim()) return;
    setIsLinking(true);
    try {
      const input = linkInput.trim();
      const isNumeric = /^\d+$/.test(input);
      await orderops.linkOrder(token, conversationId, isNumeric ? { orderId: parseInt(input) } : { orderCode: input });
      setLinkInput('');
      setShowLinkForm(false);
      loadOrders();
    } catch (err: any) {
      console.error('Failed to link order:', err);
    } finally {
      setIsLinking(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Tab configuration
  const tabs: { id: TabType; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'profile', label: 'Profile', icon: <User className="h-4 w-4" /> },
    { id: 'notes', label: 'Notes', icon: <StickyNote className="h-4 w-4" />, badge: notesList.length },
    { id: 'orders', label: 'Orders', icon: <Package className="h-4 w-4" />, badge: orders.length },
  ];

  // Profile Tab Content
  const ProfileContent = () => (
    <div className="p-4 space-y-4">
      {isLoadingContact ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : contact ? (
        <>
          {/* Avatar & Name */}
          <div className="flex items-center space-x-3 pb-4 border-b border-gray-100">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-whatsapp-dark to-whatsapp-teal flex items-center justify-center text-white text-xl font-semibold shadow-lg">
              {contact.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">{contact.name || 'Unknown'}</h3>
              <p className="text-sm text-gray-500">Customer</p>
            </div>
          </div>

          {/* Contact Details */}
          <div className="space-y-3">
            <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition-colors group">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <Phone className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">Phone</p>
                <p className="text-sm font-medium text-gray-900 truncate">{contact.phone_number || contact.wa_id}</p>
              </div>
              <button
                onClick={() => copyToClipboard(contact.phone_number || contact.wa_id, 'phone')}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-gray-200 rounded transition-all"
              >
                {copiedField === 'phone' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-gray-400" />}
              </button>
            </div>

            <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <Calendar className="h-4 w-4 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">First Contact</p>
                <p className="text-sm font-medium text-gray-900">{formatDate(contact.created_at)}</p>
              </div>
            </div>
          </div>

          {/* Labels */}
          {contact.labels && contact.labels.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2 flex items-center">
                <Tag className="h-3 w-3 mr-1" /> Labels
              </p>
              <div className="flex flex-wrap gap-1.5">
                {contact.labels.map(label => (
                  <span
                    key={label.id}
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: `${label.color}20`, color: label.color }}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2">Quick Actions</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onSendMessage?.('Hi! How can I help you today?')}
                className="flex items-center justify-center space-x-1.5 px-3 py-2 bg-whatsapp-light text-whatsapp-dark rounded-lg hover:bg-whatsapp-teal hover:text-white transition-colors text-sm font-medium"
              >
                <MessageSquare className="h-4 w-4" />
                <span>Message</span>
              </button>
              <button
                onClick={() => setActiveTab('orders')}
                className="flex items-center justify-center space-x-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                <Package className="h-4 w-4" />
                <span>Orders</span>
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <User className="h-12 w-12 mx-auto mb-2 text-gray-300" />
          <p>No contact information</p>
        </div>
      )}
    </div>
  );

  // Notes Tab Content
  const NotesContent = () => (
    <div className="flex flex-col h-full">
      {/* Add Note Form */}
      <div className="p-3 border-b border-gray-100 bg-gradient-to-r from-yellow-50 to-amber-50">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note..."
            rows={2}
            className="w-full px-3 py-2 pr-10 border border-amber-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-sm bg-white"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleAddNote();
              }
            }}
          />
          <button
            onClick={handleAddNote}
            disabled={!newNote.trim() || isSavingNote}
            className="absolute right-2 bottom-2 p-1.5 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSavingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-amber-600 mt-1">Ctrl/Cmd + Enter to save</p>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoadingNotes ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : notesList.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <StickyNote className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No notes yet</p>
            <p className="text-xs mt-1">Add notes to track important info</p>
          </div>
        ) : (
          notesList.map((note, idx) => (
            <div
              key={note.id}
              className="group p-3 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg border border-yellow-100 hover:shadow-md transition-all animate-in slide-in-from-top-2 duration-300"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</p>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-yellow-100">
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <Clock className="h-3 w-3" />
                  <span>{formatDate(note.created_at)}</span>
                  {note.agent_name && (
                    <>
                      <span>•</span>
                      <span>{note.agent_name}</span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteNote(note.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  // Orders Tab Content
  const OrdersContent = () => (
    <div className="flex flex-col h-full">
      {/* Header Actions */}
      <div className="p-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
        <span className="text-sm font-medium text-gray-700">
          {orders.length} order{orders.length !== 1 ? 's' : ''} linked
        </span>
        <div className="flex items-center space-x-2">
          <button
            onClick={loadOrders}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-white rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowLinkForm(!showLinkForm)}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Link</span>
          </button>
        </div>
      </div>

      {/* Link Form */}
      {showLinkForm && (
        <div className="p-3 bg-blue-50 border-b border-blue-100 animate-in slide-in-from-top-2 duration-200">
          <div className="flex space-x-2">
            <input
              type="text"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="Order ID or code..."
              className="flex-1 px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              onKeyDown={(e) => e.key === 'Enter' && handleLinkOrder()}
            />
            <button
              onClick={handleLinkOrder}
              disabled={!linkInput.trim() || isLinking}
              className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {isLinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Orders List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {isLoadingOrders ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Package className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No orders linked</p>
            <p className="text-xs mt-1">Link orders to track customer purchases</p>
          </div>
        ) : (
          orders.map((order, idx) => (
            <OrderCard
              key={order.id}
              order={order}
              isExpanded={expandedOrders.has(order.orderops_order_id)}
              onToggle={() => {
                const newExpanded = new Set(expandedOrders);
                if (newExpanded.has(order.orderops_order_id)) {
                  newExpanded.delete(order.orderops_order_id);
                } else {
                  newExpanded.add(order.orderops_order_id);
                }
                setExpandedOrders(newExpanded);
              }}
              onCopy={copyToClipboard}
              copiedField={copiedField}
              onSendMessage={onSendMessage}
              animationDelay={idx * 50}
            />
          ))
        )}
      </div>
    </div>
  );

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return <ProfileContent />;
      case 'notes':
        return <NotesContent />;
      case 'orders':
        return <OrdersContent />;
      default:
        return null;
    }
  };

  // Mobile Bottom Sheet Content
  const mobileContent = (
    <div className="flex flex-col h-full max-h-[70vh]">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-3 text-sm font-medium transition-all relative ${
              activeTab === tab.id
                ? 'text-whatsapp-dark'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                activeTab === tab.id ? 'bg-whatsapp-dark text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {tab.badge}
              </span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-whatsapp-dark" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile Bottom Sheet */}
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title="Details"
        icon={<User className="h-5 w-5 text-whatsapp-dark" />}
      >
        {mobileContent}
      </BottomSheet>

      {/* Desktop Panel */}
      <div
        className={`hidden md:flex flex-col h-full bg-white border-l border-gray-200 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-14' : 'w-80'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          {!isCollapsed && (
            <h3 className="font-semibold text-gray-800">Details</h3>
          )}
          <div className={`flex items-center ${isCollapsed ? 'flex-col space-y-2' : 'space-x-1'}`}>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title={isCollapsed ? 'Expand' : 'Collapse'}
            >
              {isCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {!isCollapsed && (
              <button
                onClick={onClose}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Collapsed Icon Mode */}
        {isCollapsed ? (
          <div className="flex flex-col items-center py-4 space-y-3">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsCollapsed(false);
                }}
                className={`relative p-2.5 rounded-xl transition-all ${
                  activeTab === tab.id
                    ? 'bg-whatsapp-light text-whatsapp-dark shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
                title={tab.label}
              >
                {tab.icon}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* Expanded Tabs */}
            <div className="flex border-b border-gray-200">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 text-xs font-medium transition-all relative ${
                    activeTab === tab.id
                      ? 'text-whatsapp-dark bg-whatsapp-light/50'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === tab.id ? 'bg-whatsapp-dark text-white' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-whatsapp-dark rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto">
                {renderContent()}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// Order Card Component
interface OrderCardProps {
  order: Order;
  isExpanded: boolean;
  onToggle: () => void;
  onCopy: (text: string, field: string) => void;
  copiedField: string | null;
  onSendMessage?: (message: string) => void;
  animationDelay: number;
}

function OrderCard({ order, isExpanded, onToggle, onCopy, copiedField, onSendMessage, animationDelay }: OrderCardProps) {
  const getStatusColor = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('complete') || s.includes('paid')) return 'bg-green-100 text-green-700';
    if (s.includes('pending') || s.includes('process')) return 'bg-yellow-100 text-yellow-700';
    if (s.includes('cancel') || s.includes('fail')) return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
  };

  const parsed = order.parsed_data || {};

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all animate-in slide-in-from-right-2 duration-300"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white">
            <Package className="h-5 w-5" />
          </div>
          <div className="text-left">
            <a
              href={`https://www.aalyx.com/orders/${order.orderops_order_id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-blue-600 hover:text-blue-700 hover:underline flex items-center group"
              title="Open in OrderOps"
            >
              #{order.order_code}
              <ExternalLink className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
            <p className="text-xs text-gray-500">{order.customer_name}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
            {order.status}
          </span>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-gray-100 animate-in slide-in-from-top-2 duration-200">
          {/* Price Info */}
          <div className="grid grid-cols-2 gap-2 pt-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <p className="text-xs text-green-600 flex items-center"><DollarSign className="h-3 w-3 mr-1" />Total</p>
              <p className="font-bold text-green-700">{order.total}</p>
            </div>
            <div className="p-2 bg-orange-50 rounded-lg">
              <p className="text-xs text-orange-600 flex items-center"><CreditCard className="h-3 w-3 mr-1" />Balance</p>
              <p className="font-bold text-orange-700">{order.balance}</p>
            </div>
          </div>

          {/* Delivery Status */}
          {order.delivery_status && (
            <div className="flex items-center space-x-2 p-2 bg-blue-50 rounded-lg">
              <Truck className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-blue-700">{order.delivery_status}</span>
            </div>
          )}

          {/* Address */}
          {parsed.shipping_address && (
            <div className="p-2 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 flex items-center mb-1"><MapPin className="h-3 w-3 mr-1" />Shipping</p>
              <p className="text-sm text-gray-700">{parsed.shipping_address}</p>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex space-x-2 pt-2">
            <button
              onClick={() => onCopy(order.order_code, `order-${order.id}`)}
              className="flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs"
            >
              {copiedField === `order-${order.id}` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              <span>Copy</span>
            </button>
            {onSendMessage && (
              <button
                onClick={() => onSendMessage(`Order #${order.order_code}\nTotal: ${order.total}\nStatus: ${order.status}`)}
                className="flex-1 flex items-center justify-center space-x-1 px-2 py-1.5 bg-whatsapp-light text-whatsapp-dark rounded-lg hover:bg-whatsapp-teal hover:text-white transition-colors text-xs"
              >
                <Send className="h-3 w-3" />
                <span>Send</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
