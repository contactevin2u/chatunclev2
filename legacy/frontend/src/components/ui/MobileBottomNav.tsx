'use client';

import { usePathname, useRouter } from 'next/navigation';
import { MessageSquare, UserSquare2, Bell, Settings, Smartphone } from 'lucide-react';

interface MobileBottomNavProps {
  unreadCount?: number;
  onInboxClick?: () => void;
  showInbox?: boolean;
}

export default function MobileBottomNav({
  unreadCount = 0,
  onInboxClick,
  showInbox = true
}: MobileBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    {
      name: 'Chats',
      href: '/dashboard',
      icon: MessageSquare,
      badge: unreadCount,
      onClick: onInboxClick
    },
    {
      name: 'Contacts',
      href: '/dashboard/contacts',
      icon: UserSquare2
    },
    {
      name: 'Accounts',
      href: '/dashboard/accounts',
      icon: Smartphone
    },
    {
      name: 'Settings',
      href: '/dashboard/settings',
      icon: Settings
    },
  ];

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  const handleNavClick = (item: typeof navItems[0]) => {
    if (item.onClick && item.href === '/dashboard' && pathname === '/dashboard') {
      // If we're already on dashboard and there's a custom handler, use it
      item.onClick();
    } else {
      router.push(item.href);
    }
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <button
              key={item.name}
              onClick={() => handleNavClick(item)}
              className={`flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors relative ${
                active
                  ? 'text-green-600'
                  : 'text-gray-500 active:text-gray-700 active:bg-gray-50'
              }`}
            >
              <div className="relative">
                <item.icon className={`h-6 w-6 ${active ? 'stroke-[2.5px]' : ''}`} />
                {item.badge && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] mt-1 ${active ? 'font-semibold' : 'font-medium'}`}>
                {item.name}
              </span>
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-green-600 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
