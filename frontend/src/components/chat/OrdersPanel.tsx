'use client';

import { useState, useEffect } from 'react';
import {
  X, Package, RefreshCw, Plus, Trash2, ChevronDown, ChevronRight,
  DollarSign, Truck, AlertCircle, Calendar, MapPin, Phone, User,
  Send, Copy, Check, CreditCard, Clock, FileText
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { orderops } from '@/lib/api';

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

interface OrdersPanelProps {
  conversationId: string;
  onClose: () => void;
  onSendMessage?: (message: string) => void;
}

export default function OrdersPanel({ conversationId, onClose, onSendMessage }: OrdersPanelProps) {
  const { token } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLinking, setIsLinking] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [syncingOrders, setSyncingOrders] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
  }, [token, conversationId]);

  const loadOrders = async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const { orders: loadedOrders } = await orderops.getConversationOrders(token, conversationId);
      setOrders(loadedOrders || []);
      // Auto-expand first order
      if (loadedOrders?.length > 0) {
        setExpandedOrders(new Set([loadedOrders[0].orderops_order_id]));
      }
    } catch (err: any) {
      console.error('Failed to load orders:', err);
      setError(err.message || 'Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkOrder = async () => {
    if (!token || !linkInput.trim()) return;
    setIsLinking(true);
    setError(null);
    try {
      const input = linkInput.trim();
      const isNumeric = /^\d+$/.test(input);
      await orderops.linkOrder(token, conversationId, isNumeric ? { orderId: parseInt(input) } : { orderCode: input });
      setLinkInput('');
      setShowLinkForm(false);
      loadOrders();
    } catch (err: any) {
      console.error('Failed to link order:', err);
      setError(err.message || 'Failed to link order');
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkOrder = async (orderId: number) => {
    if (!token || !confirm('Unlink this order from this conversation?')) return;
    try {
      await orderops.unlinkOrder(token, conversationId, orderId);
      loadOrders();
    } catch (err: any) {
      setError(err.message || 'Failed to unlink order');
    }
  };

  const handleSyncOrder = async (orderId: number) => {
    if (!token) return;
    setSyncingOrders(prev => new Set(prev).add(orderId));
    try {
      await orderops.syncOrder(token, conversationId, orderId);
      loadOrders();
    } catch (err: any) {
      setError(err.message || 'Failed to sync order');
    } finally {
      setSyncingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  const toggleExpanded = (orderId: number) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) newSet.delete(orderId);
      else newSet.add(orderId);
      return newSet;
    });
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) newSet.delete(sectionId);
      else newSet.add(sectionId);
      return newSet;
    });
  };

  const copyToClipboard = async (text: string, fieldId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const sendQuickMessage = (message: string) => {
    if (onSendMessage) {
      onSendMessage(message);
    }
  };

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

  const formatCurrency = (amount: string | number | null | undefined) => {
    if (!amount) return 'RM 0.00';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `RM ${num?.toFixed(2) || '0.00'}`;
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('en-MY', {
        day: 'numeric', month: 'short', year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const renderOrder = (order: Order, isChild = false) => {
    const isExpanded = expandedOrders.has(order.orderops_order_id);
    const isSyncing = syncingOrders.has(order.orderops_order_id);
    const parsedData = typeof order.parsed_data === 'string' ? JSON.parse(order.parsed_data) : order.parsed_data;
    const orderDetails = parsedData?.order;
    const dueDetails = parsedData?.due;
    const hasChildren = order.child_orders && order.child_orders.length > 0;

    // Extract details
    const customer = orderDetails?.customer || {};
    const trip = orderDetails?.trip || {};
    const items = orderDetails?.items || [];
    const payments = orderDetails?.payments || [];
    const plan = orderDetails?.plan;
    const deliveryDate = orderDetails?.delivery_date;
    const notes = orderDetails?.notes;

    const balanceAmount = parseFloat(order.balance) || 0;
    const hasBalance = balanceAmount > 0;

    return (
      <div key={order.id} className={`${isChild ? 'ml-3 border-l-2 border-blue-200 pl-2' : ''}`}>
        <div className={`bg-white rounded-lg border ${hasBalance ? 'border-orange-300' : 'border-gray-200'} mb-2 overflow-hidden`}>
          {/* Compact Header - Always visible */}
          <div
            className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => toggleExpanded(order.orderops_order_id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                <span className="font-bold text-gray-900">{order.order_code}</span>
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getStatusColor(order.status)}`}>
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
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleUnlinkOrder(order.orderops_order_id); }}
                  className="p-1 text-gray-400 hover:text-red-600 rounded"
                  title="Unlink"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Summary row */}
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-gray-600">{order.customer_name || customer.name || '-'}</span>
              <div className="flex items-center space-x-3">
                <span className="font-medium">{formatCurrency(order.total)}</span>
                {hasBalance && (
                  <span className="text-orange-600 font-medium flex items-center">
                    <DollarSign className="h-3 w-3" />
                    {formatCurrency(order.balance)}
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
                  <div className="text-xs font-medium text-blue-800 mb-1.5">Quick Send:</div>
                  <div className="flex flex-wrap gap-1">
                    {hasBalance && (
                      <button
                        onClick={() => {
                          const parts = [`*Order ${order.order_code}*`];
                          // Add items
                          if (items.length > 0) {
                            const itemsList = items.map((item: any) => `• ${item.name || item.product_name} x${item.qty || item.quantity || 1}`).join('\n');
                            parts.push(itemsList);
                          }
                          parts.push(`\nTotal: ${formatCurrency(order.total)}`);
                          const paidAmount = parseFloat(orderDetails?.paid_amount) || 0;
                          if (paidAmount > 0) parts.push(`Paid: ${formatCurrency(paidAmount)}`);
                          parts.push(`*Balance Due: ${formatCurrency(order.balance)}*`);
                          parts.push(`\nPlease make payment at your earliest convenience. Thank you!`);
                          sendQuickMessage(parts.join('\n'));
                        }}
                        className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 flex items-center space-x-1"
                      >
                        <DollarSign className="h-3 w-3" />
                        <span>Balance Due</span>
                      </button>
                    )}
                    {(trip?.driver_name || trip?.driver?.name) && (
                      <button
                        onClick={() => {
                          const driverName = trip.driver_name || trip.driver?.name;
                          const tripStatus = trip.status || order.delivery_status;
                          const parts = [`Order ${order.order_code}`, `Driver: *${driverName}*`];
                          if (tripStatus) parts.push(`Status: ${tripStatus}`);
                          if (deliveryDate) parts.push(`Delivery: ${formatDate(deliveryDate)}`);
                          sendQuickMessage(parts.join('\n'));
                        }}
                        className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 flex items-center space-x-1"
                      >
                        <Truck className="h-3 w-3" />
                        <span>Driver Info</span>
                      </button>
                    )}
                    {deliveryDate && (
                      <button
                        onClick={() => sendQuickMessage(`Your order ${order.order_code} is scheduled for delivery on ${formatDate(deliveryDate)}. We will notify you when the driver is on the way.`)}
                        className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 flex items-center space-x-1"
                      >
                        <Calendar className="h-3 w-3" />
                        <span>Delivery Date</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const parts = [`*Order ${order.order_code}*`];
                        if (order.order_type) parts.push(`Type: ${order.order_type}`);
                        // Add items
                        if (items.length > 0) {
                          parts.push(`\n*Items:*`);
                          items.forEach((item: any) => {
                            parts.push(`• ${item.name || item.product_name} x${item.qty || item.quantity || 1}`);
                          });
                        }
                        parts.push(`\n*Payment:*`);
                        parts.push(`Total: ${formatCurrency(order.total)}`);
                        const paidAmount = parseFloat(orderDetails?.paid_amount) || 0;
                        if (paidAmount > 0) parts.push(`Paid: ${formatCurrency(paidAmount)}`);
                        if (hasBalance) parts.push(`Balance: ${formatCurrency(order.balance)}`);
                        parts.push(`\nStatus: ${order.status}`);
                        const driverName = trip?.driver_name || trip?.driver?.name;
                        if (driverName) parts.push(`Driver: ${driverName}`);
                        if (deliveryDate) parts.push(`Delivery: ${formatDate(deliveryDate)}`);
                        if (notes) parts.push(`\nNote: ${notes}`);
                        sendQuickMessage(parts.join('\n'));
                      }}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center space-x-1"
                    >
                      <FileText className="h-3 w-3" />
                      <span>Summary</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Order Info Grid */}
              <div className="p-3 space-y-3">
                {/* Type & Delivery Date */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">Type</span>
                    <div className="font-medium">{order.order_type || orderDetails?.type || '-'}</div>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Delivery</span>
                    <div className="font-medium flex items-center space-x-1">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" />
                      <span>{formatDate(deliveryDate)}</span>
                    </div>
                  </div>
                </div>

                {/* Customer Details */}
                {(customer.phone || customer.address) && (
                  <div className="bg-white rounded p-2 border border-gray-200">
                    <div className="text-xs font-medium text-gray-500 mb-1">Customer</div>
                    {customer.phone && (
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center space-x-1 text-gray-700">
                          <Phone className="h-3.5 w-3.5 text-gray-400" />
                          <span>{customer.phone}</span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(customer.phone, `phone-${order.id}`)}
                          className="p-1 text-gray-400 hover:text-blue-600"
                        >
                          {copiedField === `phone-${order.id}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    )}
                    {customer.address && (
                      <div className="flex items-start space-x-1 text-sm text-gray-600 mt-1">
                        <MapPin className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                        <span className="text-xs">{customer.address}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Driver/Trip Info */}
                {(trip?.driver_name || trip?.driver?.name) && (
                  <div className="bg-green-50 rounded p-2 border border-green-200">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-green-800">Driver</div>
                      {(trip.status || order.delivery_status) && (
                        <span className={`px-1.5 py-0.5 rounded text-xs ${getDeliveryStatusColor(trip.status || order.delivery_status)}`}>
                          {trip.status || order.delivery_status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center space-x-1 text-sm">
                        <User className="h-3.5 w-3.5 text-green-600" />
                        <span className="font-medium">{trip.driver_name || trip.driver?.name}</span>
                      </div>
                      {(trip.driver?.phone) && (
                        <div className="flex items-center space-x-1">
                          <span className="text-sm text-gray-600">{trip.driver.phone}</span>
                          <button
                            onClick={() => copyToClipboard(trip.driver.phone, `driver-${order.id}`)}
                            className="p-1 text-gray-400 hover:text-blue-600"
                          >
                            {copiedField === `driver-${order.id}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
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
                      className="flex items-center justify-between w-full text-xs font-medium text-gray-500 hover:text-gray-700"
                    >
                      <span>Items ({items.length})</span>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedSections.has(`items-${order.id}`) ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedSections.has(`items-${order.id}`) && (
                      <div className="mt-1 bg-white rounded border border-gray-200 divide-y divide-gray-100">
                        {items.map((item: any, idx: number) => (
                          <div key={idx} className="p-2 text-sm flex justify-between">
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
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span>{formatCurrency(orderDetails?.subtotal)}</span>
                  </div>
                  {orderDetails?.delivery_fee && parseFloat(orderDetails.delivery_fee) > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Delivery</span>
                      <span>{formatCurrency(orderDetails.delivery_fee)}</span>
                    </div>
                  )}
                  {orderDetails?.discount && parseFloat(orderDetails.discount) > 0 && (
                    <div className="flex items-center justify-between text-sm text-green-600">
                      <span>Discount</span>
                      <span>-{formatCurrency(orderDetails.discount)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm font-bold mt-1 pt-1 border-t border-gray-100">
                    <span>Total</span>
                    <span>{formatCurrency(order.total)}</span>
                  </div>
                  {orderDetails?.paid_amount && parseFloat(orderDetails.paid_amount) > 0 && (
                    <div className="flex items-center justify-between text-sm text-green-600">
                      <span>Paid</span>
                      <span>-{formatCurrency(orderDetails.paid_amount)}</span>
                    </div>
                  )}
                  {hasBalance && (
                    <div className="flex items-center justify-between text-sm font-bold text-orange-600 mt-1 pt-1 border-t border-gray-100">
                      <span className="flex items-center space-x-1">
                        <DollarSign className="h-3.5 w-3.5" />
                        <span>Balance Due</span>
                      </span>
                      <span>{formatCurrency(order.balance)}</span>
                    </div>
                  )}
                </div>

                {/* Payments History */}
                {payments.length > 0 && (
                  <div>
                    <button
                      onClick={() => toggleSection(`payments-${order.id}`)}
                      className="flex items-center justify-between w-full text-xs font-medium text-gray-500 hover:text-gray-700"
                    >
                      <span className="flex items-center space-x-1">
                        <CreditCard className="h-3.5 w-3.5" />
                        <span>Payments ({payments.length})</span>
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedSections.has(`payments-${order.id}`) ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedSections.has(`payments-${order.id}`) && (
                      <div className="mt-1 bg-white rounded border border-gray-200 divide-y divide-gray-100">
                        {payments.map((payment: any, idx: number) => (
                          <div key={idx} className="p-2 text-sm flex justify-between items-center">
                            <div>
                              <span className="font-medium">{payment.method || payment.type}</span>
                              <span className="text-gray-400 text-xs ml-2">{formatDate(payment.date || payment.created_at)}</span>
                            </div>
                            <span className="text-green-600 font-medium">{formatCurrency(payment.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Plan (for installments) */}
                {plan && (
                  <div className="bg-purple-50 rounded p-2 border border-purple-200">
                    <div className="text-xs font-medium text-purple-800 flex items-center space-x-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Installment Plan</span>
                    </div>
                    <div className="text-sm mt-1">
                      {plan.name || `${plan.months || plan.installments} months`}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {notes && (
                  <div className="text-xs text-gray-500 bg-yellow-50 rounded p-2 border border-yellow-200">
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

  return (
    <div className="w-96 border-l border-gray-200 bg-gray-50 flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 bg-white flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Package className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Orders</h3>
          {orders.length > 0 && (
            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full">
              {orders.length}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={loadOrders}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            title="Refresh orders"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mt-3 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1 text-xs">{error}</span>
          <button onClick={() => setError(null)}><X className="h-3 w-3" /></button>
        </div>
      )}

      {/* Link form */}
      <div className="p-3 border-b border-gray-200 bg-white">
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
                className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {isLinking ? 'Linking...' : 'Link Order'}
              </button>
              <button
                onClick={() => { setShowLinkForm(false); setLinkInput(''); }}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
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

      {/* Orders list */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 text-gray-400 animate-spin" />
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
}
