import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Medical Devices Malaysia - AA Alive Sdn Bhd';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #2563eb 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Badge */}
        <div
          style={{
            background: '#fbbf24',
            color: '#78350f',
            padding: '8px 24px',
            borderRadius: 20,
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 24,
          }}
        >
          Superbrands Malaysia 2025
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: 'white',
            textAlign: 'center',
            marginBottom: 16,
          }}
        >
          Medical Devices Malaysia
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: 'rgba(255, 255, 255, 0.9)',
            textAlign: 'center',
            marginBottom: 40,
          }}
        >
          Hospital Equipment Supplier - AA Alive Sdn Bhd
        </div>

        {/* Products */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 16,
            maxWidth: 1000,
          }}
        >
          {[
            'Hospital Beds',
            'Patient Monitors',
            'Compression Stockings',
            'Oxygen Concentrators',
            'Wheelchairs',
            'Lab Equipment',
          ].map((product) => (
            <div
              key={product}
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                padding: '10px 20px',
                borderRadius: 8,
                color: 'white',
                fontSize: 18,
              }}
            >
              {product}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            color: 'rgba(255, 255, 255, 0.8)',
            fontSize: 18,
          }}
        >
          <span>Free Delivery KL/Selangor</span>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>|</span>
          <span>Rental Available</span>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>|</span>
          <span>WhatsApp Support</span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
