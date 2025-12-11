'use client';

import { MessageCircle, Send, Instagram, Facebook } from 'lucide-react';

export type ChannelType = 'whatsapp' | 'telegram' | 'instagram' | 'messenger' | 'tiktok';

// Simple className merger
function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

interface ChannelIconProps {
  channel: ChannelType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showBackground?: boolean;
}

const channelColors: Record<ChannelType, string> = {
  whatsapp: '#25D366',
  telegram: '#0088CC',
  instagram: '#E4405F',
  messenger: '#0084FF',
  tiktok: '#000000',
};

const channelBgColors: Record<ChannelType, string> = {
  whatsapp: 'bg-green-500',
  telegram: 'bg-blue-500',
  instagram: 'bg-pink-500',
  messenger: 'bg-blue-600',
  tiktok: 'bg-black',
};

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

const bgSizeClasses = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
};

export function ChannelIcon({ channel, size = 'md', className, showBackground = false }: ChannelIconProps) {
  const iconClass = cn(sizeClasses[size], className);
  const color = showBackground ? 'white' : channelColors[channel];

  const Icon = () => {
    switch (channel) {
      case 'whatsapp':
        // WhatsApp icon (custom SVG)
        return (
          <svg viewBox="0 0 24 24" fill={color} className={iconClass}>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        );
      case 'telegram':
        return <Send className={iconClass} style={{ color }} />;
      case 'instagram':
        return <Instagram className={iconClass} style={{ color }} />;
      case 'messenger':
        return <Facebook className={iconClass} style={{ color }} />;
      case 'tiktok':
        // TikTok icon (custom SVG)
        return (
          <svg viewBox="0 0 24 24" fill={color} className={iconClass}>
            <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
          </svg>
        );
      default:
        return <MessageCircle className={iconClass} style={{ color }} />;
    }
  };

  if (showBackground) {
    return (
      <div className={cn(
        bgSizeClasses[size],
        channelBgColors[channel],
        'rounded-full flex items-center justify-center'
      )}>
        <Icon />
      </div>
    );
  }

  return <Icon />;
}

export function ChannelBadge({ channel, size = 'sm' }: { channel: ChannelType; size?: 'sm' | 'md' }) {
  const badgeSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
  };

  return (
    <div className={cn(
      badgeSizes[size],
      channelBgColors[channel],
      'rounded-full flex items-center justify-center'
    )}>
      <ChannelIcon channel={channel} size="sm" showBackground className="!h-2.5 !w-2.5" />
    </div>
  );
}

export function getChannelColor(channel: ChannelType): string {
  return channelColors[channel];
}

export function getChannelName(channel: ChannelType): string {
  const names: Record<ChannelType, string> = {
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    instagram: 'Instagram',
    messenger: 'Messenger',
    tiktok: 'TikTok',
  };
  return names[channel];
}
