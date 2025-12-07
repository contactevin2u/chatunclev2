import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login - ChatUncle WhatsApp Business CRM',
  description: 'Sign in to ChatUncle to manage your WhatsApp Business accounts, automate customer responses, and boost your sales.',
  robots: {
    index: true,
    follow: true,
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
