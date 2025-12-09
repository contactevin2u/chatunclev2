'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X, User, StickyNote, Package, ChevronLeft, ChevronRight,
  Phone, Calendar, MapPin, Tag, Clock, Plus, Trash2,
  RefreshCw, ChevronDown, ChevronRight as ChevronRightIcon, DollarSign, Truck,
  Send, Copy, Check, CreditCard, MessageSquare,
  Loader2, ExternalLink, FileText
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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [syncingOrders, setSyncingOrders] = useState<Set<number>>(new Set());
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

  // Unlink order
  const handleUnlinkOrder = async (orderId: number) => {
    if (!token || !confirm('Unlink this order from this conversation?')) return;
    try {
      await orderops.unlinkOrder(token, conversationId, orderId);
      loadOrders();
    } catch (err: any) {
      console.error('Failed to unlink order:', err);
    }
  };

  // Sync order
  const handleSyncOrder = async (orderId: number) => {
    if (!token) return;
    setSyncingOrders(prev => new Set(prev).add(orderId));
    try {
      await orderops.syncOrder(token, conversationId, orderId);
      loadOrders();
    } catch (err: any) {
      console.error('Failed to sync order:', err);
    } finally {
      setSyncingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  // Toggle expanded section
  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) newSet.delete(sectionId);
      else newSet.add(sectionId);
      return newSet;
    });
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

  // Format date short (for orders)
  const formatDateShort = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('en-MY', {
        day: 'numeric', month: 'short', year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // Format currency
  const formatCurrency = (amount: string | number | null | undefined) => {
    if (!amount) return 'RM 0.00';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `RM ${num?.toFixed(2) || '0.00'}`;
  };

  // Status colors
  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'NEW': return 'bg-blue-100 text-blue-800';
      case 'CONFIRMED': return 'bg-green-100 text-green-800';
      case 'DELIVERED': return 'bg-emerald-100 text-emerald-800';
      case 'CANCELLED': return 'bg-red-100 text-red-800';
      case 'VOID': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getDeliveryStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'ASSIGNED': return 'bg-yellow-100 text-yellow-800';
      case 'PICKING_UP': return 'bg-amber-100 text-amber-800';
      case 'EN_ROUTE': return 'bg-orange-100 text-orange-800';
      case 'DELIVERED': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  // Send quick message helper
  const sendQuickMessage = (message: string) => {
    if (onSendMessage) {
      onSendMessage(message);
    }
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

  // Render single order with full details
  const renderOrder = (order: Order, isChild = false) => {
    const isExpanded = expandedOrders.has(order.orderops_order_id);
    const isSyncing = syncingOrders.has(order.orderops_order_id);
    const parsedData = typeof order.parsed_data === 'string' ? JSON.parse(order.parsed_data) : order.parsed_data;
    const orderDetails = parsedData?.order;
    const dueDetails = parsedData?.due;
    const hasChildren = order.child_orders && order.child_orders.length > 0;

    // Extract details from parsed_data (nested structure from OrderOps)
    const innerParsedData = parsedData?.parsed_data; // OrderOps nests data here
    const customer = innerParsedData?.customer || orderDetails?.customer || {};
    const trip = orderDetails?.trip || {};
    const items = innerParsedData?.order?.items || orderDetails?.items || [];
    const payments = orderDetails?.payments || [];
    const plan = orderDetails?.plan || innerParsedData?.order?.plan;
    const deliveryDate = innerParsedData?.order?.delivery_date || orderDetails?.delivery_date;
    const notes = innerParsedData?.order?.notes || orderDetails?.notes;
    const totals = innerParsedData?.order?.totals || orderDetails?.totals || {};

    // Extract total/balance with fallbacks to parsed_data
    const totalAmount = parseFloat(order.total) ||
      parseFloat(totals.total) ||
      parseFloat(orderDetails?.total) || 0;
    const balanceAmount = parseFloat(order.balance) ||
      parseFloat(dueDetails?.balance) ||
      parseFloat(totals.to_collect) ||
      parseFloat(orderDetails?.balance) || 0;
    const customerName = order.customer_name || customer.name || orderDetails?.customer_name || '';
    const hasBalance = balanceAmount > 0;

    return (
      <div key={order.id} className={`${isChild ? 'ml-3 border-l-2 border-blue-200 pl-2' : ''}`}>
        <div className={`bg-white rounded-lg border ${hasBalance ? 'border-orange-300' : 'border-gray-200'} mb-2 overflow-hidden`}>
          {/* Compact Header */}
          <div
            className="p-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => {
              const newExpanded = new Set(expandedOrders);
              if (newExpanded.has(order.orderops_order_id)) {
                newExpanded.delete(order.orderops_order_id);
              } else {
                newExpanded.add(order.orderops_order_id);
              }
              setExpandedOrders(newExpanded);
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ChevronRightIcon className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                <a
                  href={`https://www.aalyx.com/orders/${order.orderops_order_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="font-bold text-blue-600 hover:text-blue-800 hover:underline text-sm"
                  title="Open in OrderOps"
                >
                  {order.order_code}
                </a>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getStatusColor(order.status)}`}>
                  {order.status}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={(e) => { e.stopPropagation(); handleSyncOrder(order.orderops_order_id); }}
                  disabled={isSyncing}
                  className="p-1 text-gray-400 hover:text-blue-600 rounded"
                  title="Refresh"
                >
                  <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleUnlinkOrder(order.orderops_order_id); }}
                  className="p-1 text-gray-400 hover:text-red-600 rounded"
                  title="Unlink"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Summary row */}
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-gray-600 truncate">{customerName || '-'}</span>
              <div className="flex items-center space-x-2">
                <span className="font-medium">{formatCurrency(totalAmount)}</span>
                {hasBalance && (
                  <span className="text-orange-600 font-medium flex items-center">
                    <DollarSign className="h-3 w-3" />
                    {formatCurrency(balanceAmount)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Expanded Details */}
          {isExpanded && (
            <div className="border-t border-gray-100 bg-gray-50">
              {/* Quick Actions */}
              {onSendMessage && (
                <div className="p-2 border-b border-gray-100 bg-blue-50">
                  <div className="text-[10px] font-medium text-blue-800 mb-1">Quick Send:</div>
                  <div className="flex flex-wrap gap-1">
                    {hasBalance && (
                      <button
                        onClick={() => {
                          const parts = [`*Order ${order.order_code}*`];
                          if (items.length > 0) {
                            const itemsList = items.map((item: any) => `• ${item.name || item.product_name} x${item.qty || item.quantity || 1}`).join('\n');
                            parts.push(itemsList);
                          }
                          parts.push(`\nTotal: ${formatCurrency(totalAmount)}`);
                          const paidAmount = parseFloat(orderDetails?.paid_amount) || parseFloat(totals.paid) || 0;
                          if (paidAmount > 0) parts.push(`Paid: ${formatCurrency(paidAmount)}`);
                          parts.push(`*Balance Due: ${formatCurrency(balanceAmount)}*`);
                          parts.push(`\nPlease make payment at your earliest convenience. Thank you!`);
                          sendQuickMessage(parts.join('\n'));
                        }}
                        className="px-1.5 py-1 text-[10px] bg-orange-100 text-orange-700 rounded hover:bg-orange-200 flex items-center space-x-0.5"
                      >
                        <DollarSign className="h-2.5 w-2.5" />
                        <span>Balance</span>
                      </button>
                    )}
                    {(trip?.driver_name || trip?.driver?.name) && (
                      <button
                        onClick={() => {
                          const driverName = trip.driver_name || trip.driver?.name;
                          const tripStatus = trip.status || order.delivery_status;
                          const parts = [`Order ${order.order_code}`, `Driver: *${driverName}*`];
                          if (tripStatus) parts.push(`Status: ${tripStatus}`);
                          if (deliveryDate) parts.push(`Delivery: ${formatDateShort(deliveryDate)}`);
                          sendQuickMessage(parts.join('\n'));
                        }}
                        className="px-1.5 py-1 text-[10px] bg-green-100 text-green-700 rounded hover:bg-green-200 flex items-center space-x-0.5"
                      >
                        <Truck className="h-2.5 w-2.5" />
                        <span>Driver</span>
                      </button>
                    )}
                    {deliveryDate && (
                      <button
                        onClick={() => sendQuickMessage(`Your order ${order.order_code} is scheduled for delivery on ${formatDateShort(deliveryDate)}. We will notify you when the driver is on the way.`)}
                        className="px-1.5 py-1 text-[10px] bg-blue-100 text-blue-700 rounded hover:bg-blue-200 flex items-center space-x-0.5"
                      >
                        <Calendar className="h-2.5 w-2.5" />
                        <span>Date</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const parts = [`*Order ${order.order_code}*`];
                        if (order.order_type) parts.push(`Type: ${order.order_type}`);
                        if (items.length > 0) {
                          parts.push(`\n*Items:*`);
                          items.forEach((item: any) => {
                            parts.push(`• ${item.name || item.product_name} x${item.qty || item.quantity || 1}`);
                          });
                        }
                        parts.push(`\n*Payment:*`);
                        parts.push(`Total: ${formatCurrency(totalAmount)}`);
                        const paidAmount = parseFloat(orderDetails?.paid_amount) || parseFloat(totals.paid) || 0;
                        if (paidAmount > 0) parts.push(`Paid: ${formatCurrency(paidAmount)}`);
                        if (hasBalance) parts.push(`Balance: ${formatCurrency(balanceAmount)}`);
                        parts.push(`\nStatus: ${order.status}`);
                        const driverName = trip?.driver_name || trip?.driver?.name;
                        if (driverName) parts.push(`Driver: ${driverName}`);
                        if (deliveryDate) parts.push(`Delivery: ${formatDateShort(deliveryDate)}`);
                        if (notes) parts.push(`\nNote: ${notes}`);
                        sendQuickMessage(parts.join('\n'));
                      }}
                      className="px-1.5 py-1 text-[10px] bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center space-x-0.5"
                    >
                      <FileText className="h-2.5 w-2.5" />
                      <span>Summary</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Order Info */}
              <div className="p-2 space-y-2">
                {/* Type & Delivery Date */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500 text-[10px]">Type</span>
                    <div className="font-medium">{order.order_type || orderDetails?.type || '-'}</div>
                  </div>
                  <div>
                    <span className="text-gray-500 text-[10px]">Delivery</span>
                    <div className="font-medium flex items-center space-x-1">
                      <Calendar className="h-3 w-3 text-gray-400" />
                      <span>{formatDateShort(deliveryDate)}</span>
                    </div>
                  </div>
                </div>

                {/* Customer Details */}
                {(customer.phone || customer.address) && (
                  <div className="bg-white rounded p-2 border border-gray-200">
                    <div className="text-[10px] font-medium text-gray-500 mb-1">Customer</div>
                    {customer.phone && (
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-1 text-gray-700">
                          <Phone className="h-3 w-3 text-gray-400" />
                          <span>{customer.phone}</span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(customer.phone, `phone-${order.id}`)}
                          className="p-0.5 text-gray-400 hover:text-blue-600"
                        >
                          {copiedField === `phone-${order.id}` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    )}
                    {customer.address && (
                      <div className="flex items-start space-x-1 text-xs text-gray-600 mt-1">
                        <MapPin className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />
                        <span className="text-[10px]">{customer.address}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Driver/Trip Info */}
                {(trip?.driver_name || trip?.driver?.name) && (
                  <div className="bg-green-50 rounded p-2 border border-green-200">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-medium text-green-800">Driver</div>
                      {(trip.status || order.delivery_status) && (
                        <span className={`px-1 py-0.5 rounded text-[10px] ${getDeliveryStatusColor(trip.status || order.delivery_status)}`}>
                          {trip.status || order.delivery_status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center space-x-1 text-xs">
                        <User className="h-3 w-3 text-green-600" />
                        <span className="font-medium">{trip.driver_name || trip.driver?.name}</span>
                      </div>
                      {(trip.driver?.phone) && (
                        <div className="flex items-center space-x-1">
                          <span className="text-[10px] text-gray-600">{trip.driver.phone}</span>
                          <button
                            onClick={() => copyToClipboard(trip.driver.phone, `driver-${order.id}`)}
                            className="p-0.5 text-gray-400 hover:text-blue-600"
                          >
                            {copiedField === `driver-${order.id}` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Items Section */}
                {items.length > 0 && (
                  <div>
                    <button
                      onClick={() => toggleSection(`items-${order.id}`)}
                      className="flex items-center justify-between w-full text-[10px] font-medium text-gray-500 hover:text-gray-700"
                    >
                      <span>Items ({items.length})</span>
                      <ChevronDown className={`h-3 w-3 transition-transform ${expandedSections.has(`items-${order.id}`) ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedSections.has(`items-${order.id}`) && (
                      <div className="mt-1 bg-white rounded border border-gray-200 divide-y divide-gray-100">
                        {items.map((item: any, idx: number) => (
                          <div key={idx} className="p-1.5 text-xs flex justify-between">
                            <div>
                              <span className="font-medium">{item.name || item.product_name}</span>
                              <span className="text-gray-500 ml-1">x{item.qty || item.quantity || 1}</span>
                            </div>
                            <span className="text-gray-600">{formatCurrency(item.price || item.unit_price)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Payment Info */}
                <div className="bg-white rounded p-2 border border-gray-200">
                  <div className="text-[10px] font-medium text-gray-500 mb-1 flex items-center space-x-1">
                    <CreditCard className="h-3 w-3" />
                    <span>Payment</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Subtotal</span>
                    <span>{formatCurrency(orderDetails?.subtotal)}</span>
                  </div>
                  {orderDetails?.delivery_fee && parseFloat(orderDetails.delivery_fee) > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Delivery</span>
                      <span>{formatCurrency(orderDetails.delivery_fee)}</span>
                    </div>
                  )}
                  {orderDetails?.discount && parseFloat(orderDetails.discount) > 0 && (
                    <div className="flex items-center justify-between text-xs text-green-600">
                      <span>Discount</span>
                      <span>-{formatCurrency(orderDetails.discount)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs font-bold mt-1 pt-1 border-t border-gray-100">
                    <span>Total</span>
                    <span>{formatCurrency(totalAmount)}</span>
                  </div>
                  {(orderDetails?.paid_amount && parseFloat(orderDetails.paid_amount) > 0) || (dueDetails?.paid && parseFloat(dueDetails.paid) > 0) || (totals.paid && totals.paid > 0) ? (
                    <div className="flex items-center justify-between text-xs text-green-600">
                      <span>Paid</span>
                      <span>-{formatCurrency(orderDetails?.paid_amount || dueDetails?.paid || totals.paid)}</span>
                    </div>
                  ) : null}
                  {hasBalance && (
                    <div className="flex items-center justify-between text-xs font-bold text-orange-600 mt-1 pt-1 border-t border-gray-100">
                      <span className="flex items-center space-x-1">
                        <DollarSign className="h-3 w-3" />
                        <span>Balance Due</span>
                      </span>
                      <span>{formatCurrency(balanceAmount)}</span>
                    </div>
                  )}
                </div>

                {/* Payments History */}
                {payments.length > 0 && (
                  <div>
                    <button
                      onClick={() => toggleSection(`payments-${order.id}`)}
                      className="flex items-center justify-between w-full text-[10px] font-medium text-gray-500 hover:text-gray-700"
                    >
                      <span className="flex items-center space-x-1">
                        <Clock className="h-3 w-3" />
                        <span>Payment History ({payments.length})</span>
                      </span>
                      <ChevronDown className={`h-3 w-3 transition-transform ${expandedSections.has(`payments-${order.id}`) ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedSections.has(`payments-${order.id}`) && (
                      <div className="mt-1 bg-white rounded border border-gray-200 divide-y divide-gray-100">
                        {payments.map((payment: any, idx: number) => (
                          <div key={idx} className="p-1.5 text-xs">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center space-x-1">
                                <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${
                                  payment.status === 'COMPLETED' || payment.status === 'SUCCESS'
                                    ? 'bg-green-100 text-green-700'
                                    : payment.status === 'PENDING'
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {payment.method || payment.type || 'Payment'}
                                </span>
                                <span className="text-gray-400 text-[10px]">{formatDateShort(payment.date || payment.created_at)}</span>
                              </div>
                              <span className="text-green-600 font-medium">{formatCurrency(payment.amount)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Plan (for installments) */}
                {plan && (
                  <div className="bg-purple-50 rounded p-2 border border-purple-200">
                    <div className="text-[10px] font-medium text-purple-800 flex items-center space-x-1">
                      <Clock className="h-3 w-3" />
                      <span>Installment Plan</span>
                    </div>
                    <div className="text-xs mt-1">
                      {plan.name || `${plan.months || plan.installments} months`}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {notes && (
                  <div className="text-[10px] text-gray-500 bg-yellow-50 rounded p-2 border border-yellow-200">
                    <span className="font-medium">Note:</span> {notes}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Child orders */}
        {hasChildren && isExpanded && (
          <div className="mt-1">
            {order.child_orders!.map(child => renderOrder(child, true))}
          </div>
        )}
      </div>
    );
  };

  // Orders Tab Content
  const OrdersContent = () => (
    <div className="flex flex-col h-full">
      {/* Link form */}
      <div className="p-2 border-b border-gray-200 bg-white">
        {showLinkForm ? (
          <div className="space-y-2">
            <input
              type="text"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="Order ID or Code (e.g. 7037 or WC5577)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && handleLinkOrder()}
              autoFocus
            />
            <div className="flex space-x-2">
              <button
                onClick={handleLinkOrder}
                disabled={isLinking || !linkInput.trim()}
                className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {isLinking ? 'Linking...' : 'Link Order'}
              </button>
              <button
                onClick={() => { setShowLinkForm(false); setLinkInput(''); }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowLinkForm(true)}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="text-sm font-medium">Link Order</span>
          </button>
        )}
      </div>

      {/* Orders List */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoadingOrders ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Package className="h-10 w-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No orders linked</p>
            <p className="text-xs mt-1">Link orders by ID or code above</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map(order => renderOrder(order))}
          </div>
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
