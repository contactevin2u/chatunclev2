'use client';

import { useEffect, useState } from 'react';
import { Package, CheckCircle, XCircle, X } from 'lucide-react';

interface OrderOpsResult {
  success: boolean;
  messageId: string;
  conversationId: string;
  orderCode?: string;
  error?: string;
  duration?: number;
}

interface OrderOpsToastProps {
  result: OrderOpsResult;
  onDismiss: () => void;
}

export default function OrderOpsToast({ result, onDismiss }: OrderOpsToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Animate in
    setTimeout(() => setIsVisible(true), 100);

    // Auto-dismiss after 5 seconds
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300);
    }, 5000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  const seconds = result.duration ? Math.round(result.duration / 1000) : 0;

  return (
    <div
      className={`fixed top-4 right-4 z-[100] transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-w-sm">
        {/* Header */}
        <div className={`px-4 py-3 flex items-center justify-between ${
          result.success ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-red-500 to-rose-600'
        }`}>
          <div className="flex items-center gap-2 text-white">
            <Package className="h-5 w-5" />
            <span className="font-bold text-sm">
              {result.success ? 'Order Created' : 'Order Failed'}
            </span>
          </div>
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(onDismiss, 300);
            }}
            className="text-white/80 hover:text-white p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex items-center gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            result.success ? 'bg-green-100' : 'bg-red-100'
          }`}>
            {result.success ? (
              <CheckCircle className="h-6 w-6 text-green-600" />
            ) : (
              <XCircle className="h-6 w-6 text-red-600" />
            )}
          </div>
          <div className="flex-1">
            {result.success ? (
              <>
                <h3 className="font-bold text-gray-900">{result.orderCode || 'Order'}</h3>
                <p className="text-sm text-gray-500">
                  Processed in {seconds}s
                </p>
              </>
            ) : (
              <>
                <h3 className="font-bold text-gray-900">Processing Failed</h3>
                <p className="text-sm text-gray-500 line-clamp-2">
                  {result.error || 'Unknown error'}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
