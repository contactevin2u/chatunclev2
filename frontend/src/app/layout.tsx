import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';
import { ThemeProvider } from '@/hooks/useTheme';

const inter = Inter({ subsets: ['latin'] });

// SEO Keywords Research for WhatsApp Business Platform Malaysia
// Primary Keywords:
// - whatsapp business malaysia
// - whatsapp crm malaysia
// - whatsapp marketing platform
// - business messaging solution
// - multi-account whatsapp management
//
// Secondary Keywords:
// - whatsapp automation malaysia
// - whatsapp customer service
// - bulk whatsapp sender malaysia
// - whatsapp api platform
// - team inbox whatsapp
//
// Long-tail Keywords:
// - best whatsapp business tool malaysia
// - manage multiple whatsapp accounts
// - whatsapp sales automation platform
// - whatsapp customer engagement tool
// - enterprise whatsapp solution malaysia

export const metadata: Metadata = {
  metadataBase: new URL('https://chatuncle.my'),
  title: {
    default: 'ChatUncle - WhatsApp Business CRM Platform Malaysia | AA Alive Sdn Bhd',
    template: '%s | ChatUncle Malaysia',
  },
  description: 'ChatUncle is Malaysia\'s leading WhatsApp Business CRM platform. Manage multiple WhatsApp accounts, automate customer responses, and boost sales with our AI-powered messaging solution. Trusted by Malaysian businesses.',
  keywords: [
    'whatsapp business malaysia',
    'whatsapp crm malaysia',
    'whatsapp marketing platform',
    'business messaging solution',
    'multi-account whatsapp management',
    'whatsapp automation malaysia',
    'whatsapp customer service',
    'bulk whatsapp sender malaysia',
    'whatsapp api platform',
    'team inbox whatsapp',
    'best whatsapp business tool malaysia',
    'manage multiple whatsapp accounts',
    'whatsapp sales automation platform',
    'enterprise whatsapp solution malaysia',
    'AA Alive Sdn Bhd',
    'chatuncle',
  ],
  authors: [{ name: 'AA Alive Sdn Bhd', url: 'https://chatuncle.my' }],
  creator: 'AA Alive Sdn Bhd',
  publisher: 'AA Alive Sdn Bhd',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: 'https://chatuncle.my',
    languages: {
      'en-MY': 'https://chatuncle.my',
      'ms-MY': 'https://chatuncle.my',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_MY',
    url: 'https://chatuncle.my',
    siteName: 'ChatUncle',
    title: 'ChatUncle - WhatsApp Business CRM Platform Malaysia',
    description: 'Malaysia\'s leading WhatsApp Business CRM platform. Manage multiple accounts, automate responses, and boost sales with AI-powered messaging.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ChatUncle WhatsApp Business CRM Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChatUncle - WhatsApp Business CRM Platform Malaysia',
    description: 'Malaysia\'s leading WhatsApp Business CRM platform. Manage multiple accounts, automate responses, and boost sales.',
    images: ['/twitter-image.png'],
    creator: '@chatuncle',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'your-google-verification-code',
  },
  category: 'Business Software',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#25D366' },
    { media: '(prefers-color-scheme: dark)', color: '#128C7E' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

// Organization Schema Markup
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'AA Alive Sdn Bhd',
  alternateName: 'ChatUncle',
  url: 'https://chatuncle.my',
  logo: 'https://chatuncle.my/logo.png',
  description: 'AA Alive Sdn Bhd is a Malaysian technology company providing WhatsApp Business CRM solutions and healthcare equipment.',
  address: {
    '@type': 'PostalAddress',
    addressCountry: 'MY',
    addressRegion: 'Malaysia',
  },
  sameAs: [
    'https://evin.my',
    'https://evin2u.com',
    'https://katil-hospital.my',
    'https://oxygenconcentrator.my',
    'https://electric-wheelchair.my',
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    availableLanguage: ['English', 'Malay'],
  },
};

// WebApplication Schema Markup
const webApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'ChatUncle',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web Browser',
  description: 'WhatsApp Business CRM platform for managing multiple accounts, automating responses, and boosting sales.',
  url: 'https://chatuncle.my',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'MYR',
    availability: 'https://schema.org/InStock',
  },
  creator: {
    '@type': 'Organization',
    name: 'AA Alive Sdn Bhd',
  },
  featureList: [
    'Multi-account WhatsApp management',
    'AI-powered auto-reply',
    'Team inbox collaboration',
    'Message templates',
    'Contact management',
    'Analytics dashboard',
    'Scheduled messaging',
  ],
};

// SoftwareApplication Schema
const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ChatUncle',
  applicationCategory: 'CRM Software',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'MYR',
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    ratingCount: '150',
    bestRating: '5',
    worstRating: '1',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-MY" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
