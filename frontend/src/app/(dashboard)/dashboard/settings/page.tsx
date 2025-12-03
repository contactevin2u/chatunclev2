'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { User, Bell, Shield, LogOut } from 'lucide-react';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState(true);

  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

        {/* Profile Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
          <div className="flex items-center space-x-3 mb-4">
            <User className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-medium text-gray-900">Profile</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={user?.name || ''}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={user?.email || ''}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <input
                type="text"
                value={user?.role === 'admin' ? 'Administrator' : 'Sales Agent'}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700"
              />
            </div>
          </div>
        </div>

        {/* Notifications Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
          <div className="flex items-center space-x-3 mb-4">
            <Bell className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-medium text-gray-900">Notifications</h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Sound notifications</p>
              <p className="text-sm text-gray-500">Play sound when new message arrives</p>
            </div>
            <button
              onClick={() => setNotifications(!notifications)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                notifications ? 'bg-whatsapp-dark' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  notifications ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Security Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
          <div className="flex items-center space-x-3 mb-4">
            <Shield className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-medium text-gray-900">Security</h2>
          </div>

          <button className="text-whatsapp-dark hover:text-whatsapp-teal font-medium">
            Change Password
          </button>
        </div>

        {/* Logout */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <button
            onClick={logout}
            className="flex items-center space-x-2 text-red-600 hover:text-red-700 font-medium"
          >
            <LogOut className="h-5 w-5" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
