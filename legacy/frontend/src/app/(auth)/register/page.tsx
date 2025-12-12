'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MessageSquare, Lock } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();

  // Auto-redirect to login after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/login');
    }, 5000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center">
            <div className="bg-gray-400 p-3 rounded-full">
              <Lock className="h-8 w-8 text-white" />
            </div>
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            Registration Disabled
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Public registration is not available. Please contact your administrator to create an account.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
            You will be redirected to login in 5 seconds...
          </div>

          <Link
            href="/login"
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-whatsapp-dark hover:bg-whatsapp-teal focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-whatsapp-dark transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
