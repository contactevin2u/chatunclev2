import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 24,
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 36,
        }}
      >
        <svg
          width="110"
          height="110"
          viewBox="0 0 24 24"
          fill="white"
        >
          <path d="M12 2C6.48 2 2 5.58 2 10c0 2.12.89 4.04 2.34 5.46L3 22l5.27-2.34C9.46 19.89 10.7 20 12 20c5.52 0 10-3.58 10-8s-4.48-8-10-8z" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
