'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import {
  MessageSquare,
  Smartphone,
  FileText,
  Settings,
  LogOut,
  Users,
  BarChart3,
  UserSquare2,
  Clock,
  Bot,
  Menu,
  X,
} from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Check if we're on the main inbox page (for focused mode)
  const isInboxPage = pathname === '/dashboard';

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  // Close sidebar when navigating
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const navigation = [
    { name: 'Inbox', href: '/dashboard', icon: MessageSquare },
    { name: 'Contacts', href: '/dashboard/contacts', icon: UserSquare2 },
    { name: 'Accounts', href: '/dashboard/accounts', icon: Smartphone },
    { name: 'Scheduled', href: '/dashboard/scheduled', icon: Clock },
    { name: 'Auto-Reply', href: '/dashboard/auto-reply', icon: Bot },
    { name: 'Templates', href: '/dashboard/templates', icon: FileText },
    { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  ];

  const adminNavigation = [
    { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    { name: 'Agents', href: '/admin/agents', icon: Users },
    { name: 'All Chats', href: '/admin/conversations', icon: MessageSquare },
  ];

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Menu toggle button - fixed position */}
      <button
        onClick={() => setSidebarOpen(true)}
        className={`fixed top-3 left-3 z-40 p-2 bg-white rounded-lg shadow-md hover:bg-gray-50 transition-all ${
          sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        title="Open menu"
      >
        <Menu className="h-5 w-5 text-gray-600" />
      </button>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - slide out panel */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 flex flex-col z-50 transform transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-green-600 p-1.5 rounded-lg">
              <MessageSquare className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-900">ChatUncle</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
            title="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive(item.href)
                  ? 'bg-green-50 text-green-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm">{item.name}</span>
            </Link>
          ))}

          {user.role === 'admin' && (
            <>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-2 px-3">
                Admin
              </div>
              {adminNavigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isActive(item.href)
                      ? 'bg-green-50 text-green-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-sm">{item.name}</span>
                </Link>
              ))}
            </>
          )}
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 min-w-0">
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content - full width */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
