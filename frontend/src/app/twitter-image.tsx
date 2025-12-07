import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'ChatUncle - WhatsApp Business CRM Platform Malaysia';
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
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #15803d 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Logo and Brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              background: 'white',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 24,
            }}
          >
            <svg
              width="50"
              height="50"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#22c55e"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: 'white',
            }}
          >
            ChatUncle
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 36,
            color: 'rgba(255, 255, 255, 0.9)',
            textAlign: 'center',
            maxWidth: 900,
            lineHeight: 1.4,
          }}
        >
          WhatsApp Business CRM for Malaysian Businesses
        </div>

        {/* CTA */}
        <div
          style={{
            marginTop: 40,
            background: 'white',
            padding: '16px 48px',
            borderRadius: 12,
            color: '#16a34a',
            fontSize: 24,
            fontWeight: 600,
          }}
        >
          Start Free Trial → chatuncle.my
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
