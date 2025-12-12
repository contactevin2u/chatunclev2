import type { ChannelType } from '@chatuncle/shared';

interface ChannelIconProps {
  type: ChannelType;
  size?: number;
  className?: string;
}

export function ChannelIcon({ type, size = 24, className = '' }: ChannelIconProps) {
  const iconMap: Record<ChannelType, { color: string; label: string }> = {
    whatsapp: { color: '#25D366', label: 'W' },
    telegram: { color: '#0088cc', label: 'T' },
    tiktok: { color: '#000000', label: 'TT' },
    instagram: { color: '#E4405F', label: 'IG' },
    messenger: { color: '#0084FF', label: 'M' },
  };

  const { color, label } = iconMap[type] || { color: '#6B7280', label: '?' };

  return (
    <div
      className={`flex items-center justify-center rounded-full text-white font-bold ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: size * 0.4,
      }}
    >
      {label}
    </div>
  );
}
