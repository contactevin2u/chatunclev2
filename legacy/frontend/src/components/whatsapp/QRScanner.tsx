'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Loader2, X } from 'lucide-react';

interface QRScannerProps {
  qrCode: string | null;
  onClose: () => void;
}

export default function QRScanner({ qrCode, onClose }: QRScannerProps) {
  return (
    <div className="text-center">
      <div className="mb-4">
        {qrCode ? (
          <div className="inline-block p-4 bg-white border border-gray-200 rounded-lg">
            <QRCodeSVG value={qrCode} size={256} level="M" />
          </div>
        ) : (
          <div className="w-64 h-64 mx-auto bg-gray-100 rounded-lg flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          </div>
        )}
      </div>

      <div className="text-sm text-gray-600 mb-6 space-y-2">
        <p className="font-medium">To connect your WhatsApp:</p>
        <ol className="text-left list-decimal list-inside space-y-1">
          <li>Open WhatsApp on your phone</li>
          <li>Tap Menu or Settings and select Linked Devices</li>
          <li>Tap on Link a Device</li>
          <li>Point your phone at this screen to capture the QR code</li>
        </ol>
      </div>

      <button
        onClick={onClose}
        className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
