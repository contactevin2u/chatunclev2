import { Metadata } from 'next';
import Link from 'next/link';
import { MessageSquare, ExternalLink, Building2, Heart, Stethoscope, Armchair, Globe } from 'lucide-react';

export const metadata: Metadata = {
  title: 'AA Alive Group Partners - Healthcare & Technology | ChatUncle Malaysia',
  description: 'Discover the AA Alive Sdn Bhd network of healthcare and technology businesses in Malaysia. Hospital beds, oxygen concentrators, electric wheelchairs, and business communication solutions.',
  keywords: [
    'AA Alive Sdn Bhd',
    'katil hospital malaysia',
    'oxygen concentrator supplier',
    'electric wheelchair malaysia',
    'evin healthcare',
    'medical equipment malaysia',
  ],
  alternates: {
    canonical: 'https://chatuncle.my/partners',
  },
};

const partners = [
  {
    name: 'Katil-Hospital.my',
    url: 'https://katil-hospital.my',
    category: 'Hospital Equipment',
    description: 'Malaysia\'s trusted supplier of hospital beds for home care and medical facilities. We offer manual and electric hospital beds with rental and purchase options. Free delivery in KL and Selangor.',
    icon: Stethoscope,
    color: 'bg-blue-500',
    features: ['Hospital Bed Sales', 'Rental Services', 'Free Setup', 'Nationwide Delivery'],
    keywords: 'katil hospital, hospital bed malaysia, medical bed, patient bed, sewa katil hospital',
  },
  {
    name: 'OxygenConcentrator.my',
    url: 'https://oxygenconcentrator.my',
    category: 'Respiratory Equipment',
    description: 'Specialist in home oxygen therapy equipment. We supply oxygen concentrators for COPD patients, post-COVID recovery, and respiratory conditions. Portable and home units available.',
    icon: Heart,
    color: 'bg-red-500',
    features: ['5L-10L Concentrators', 'Portable Units', 'Rental Options', '24/7 Support'],
    keywords: 'oxygen concentrator malaysia, mesin oksigen, home oxygen therapy, portable oxygen, COPD equipment',
  },
  {
    name: 'Electric-Wheelchair.my',
    url: 'https://electric-wheelchair.my',
    category: 'Mobility Solutions',
    description: 'Premium electric wheelchairs and mobility solutions for seniors and individuals with disabilities. Test rides available at our showroom. After-sales service and battery support included.',
    icon: Armchair,
    color: 'bg-purple-500',
    features: ['Electric Wheelchairs', 'Motorized Scooters', 'Test Rides', 'Battery Service'],
    keywords: 'electric wheelchair malaysia, kerusi roda elektrik, mobility scooter, wheelchair for elderly',
  },
  {
    name: 'Evin.my',
    url: 'https://evin.my',
    category: 'Healthcare Solutions',
    description: 'AA Alive\'s flagship healthcare platform connecting patients with quality medical equipment and home care solutions across Malaysia.',
    icon: Globe,
    color: 'bg-green-500',
    features: ['Healthcare Directory', 'Equipment Catalog', 'Care Resources', 'Expert Advice'],
    keywords: 'evin malaysia, healthcare solutions, medical equipment directory',
  },
  {
    name: 'Evin2u.com',
    url: 'https://evin2u.com',
    category: 'E-Commerce',
    description: 'Online marketplace for healthcare and medical equipment. Shop for home care products with nationwide delivery and easy returns.',
    icon: Building2,
    color: 'bg-orange-500',
    features: ['Online Shopping', 'Secure Payments', 'Fast Delivery', 'Easy Returns'],
    keywords: 'evin2u, medical equipment online, healthcare e-commerce malaysia',
  },
];

// Organization schema with all sameAs links
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "AA Alive Sdn Bhd",
  "url": "https://chatuncle.my",
  "description": "Malaysian technology and healthcare company operating multiple business units including WhatsApp CRM, hospital equipment, and medical devices.",
  "sameAs": [
    "https://katil-hospital.my",
    "https://oxygenconcentrator.my",
    "https://electric-wheelchair.my",
    "https://evin.my",
    "https://evin2u.com"
  ],
  "subOrganization": [
    {
      "@type": "Organization",
      "name": "Katil Hospital Malaysia",
      "url": "https://katil-hospital.my",
      "description": "Hospital bed supplier in Malaysia"
    },
    {
      "@type": "Organization",
      "name": "Oxygen Concentrator Malaysia",
      "url": "https://oxygenconcentrator.my",
      "description": "Oxygen therapy equipment supplier"
    },
    {
      "@type": "Organization",
      "name": "Electric Wheelchair Malaysia",
      "url": "https://electric-wheelchair.my",
      "description": "Mobility equipment supplier"
    }
  ]
};

export default function PartnersPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-2">
              <div className="bg-green-600 p-2 rounded-lg">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-gray-900">ChatUncle</span>
            </Link>
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-gray-600 hover:text-gray-900">Home</Link>
              <Link href="/blog" className="text-gray-600 hover:text-gray-900">Blog</Link>
              <Link href="/login" className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="bg-gradient-to-r from-green-600 to-teal-600 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-4">
            AA Alive Group Partners
          </h1>
          <p className="text-xl text-green-100 max-w-2xl mx-auto">
            Discover our network of healthcare and technology businesses serving Malaysians
            with quality products and exceptional service.
          </p>
        </div>
      </header>

      {/* Partners Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {partners.map((partner) => (
            <article
              key={partner.name}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className={`${partner.color} p-6`}>
                <div className="flex items-center justify-between">
                  <partner.icon className="h-10 w-10 text-white" />
                  <span className="bg-white/20 text-white text-xs px-3 py-1 rounded-full">
                    {partner.category}
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-white mt-4">
                  {partner.name}
                </h2>
              </div>
              <div className="p-6">
                <p className="text-gray-600 mb-4">
                  {partner.description}
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {partner.features.map((feature, i) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                      {feature}
                    </span>
                  ))}
                </div>
                <a
                  href={partner.url}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center text-green-600 font-medium hover:text-green-700"
                  title={partner.keywords}
                >
                  Visit {partner.name}
                  <ExternalLink className="h-4 w-4 ml-1" />
                </a>
              </div>
            </article>
          ))}

          {/* ChatUncle Card */}
          <article className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl shadow-sm overflow-hidden text-white">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <MessageSquare className="h-10 w-10" />
                <span className="bg-white/20 text-xs px-3 py-1 rounded-full">
                  Business Software
                </span>
              </div>
              <h2 className="text-2xl font-bold mt-4">
                ChatUncle.my
              </h2>
            </div>
            <div className="bg-green-700/50 p-6">
              <p className="text-green-100 mb-4">
                WhatsApp Business CRM platform for Malaysian businesses. Manage multiple accounts,
                automate responses, and boost sales with AI-powered messaging.
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {['WhatsApp CRM', 'Auto-Reply', 'Multi-Account', 'AI Chatbot'].map((feature, i) => (
                  <span key={i} className="text-xs bg-white/20 px-2 py-1 rounded">
                    {feature}
                  </span>
                ))}
              </div>
              <Link
                href="/login"
                className="inline-flex items-center text-white font-medium hover:underline"
              >
                Start Free Trial
                <ExternalLink className="h-4 w-4 ml-1" />
              </Link>
            </div>
          </article>
        </div>
      </section>

      {/* About Section */}
      <section className="bg-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">
            About AA Alive Sdn Bhd
          </h2>
          <div className="prose prose-lg max-w-none text-gray-600">
            <p>
              <strong>AA Alive Sdn Bhd</strong> is a Malaysian company committed to improving
              lives through technology and healthcare solutions. Founded with a mission to
              make quality medical equipment accessible to all Malaysians, we have grown
              to operate multiple business units:
            </p>
            <ul>
              <li>
                <a href="https://katil-hospital.my" target="_blank" rel="noopener" className="text-green-600 hover:text-green-700">
                  Katil-Hospital.my
                </a> - Hospital beds for home and clinical use
              </li>
              <li>
                <a href="https://oxygenconcentrator.my" target="_blank" rel="noopener" className="text-green-600 hover:text-green-700">
                  OxygenConcentrator.my
                </a> - Respiratory therapy equipment
              </li>
              <li>
                <a href="https://electric-wheelchair.my" target="_blank" rel="noopener" className="text-green-600 hover:text-green-700">
                  Electric-Wheelchair.my
                </a> - Mobility solutions
              </li>
              <li>
                <a href="https://evin.my" target="_blank" rel="noopener" className="text-green-600 hover:text-green-700">
                  Evin.my
                </a> - Healthcare solutions platform
              </li>
              <li>
                <a href="https://evin2u.com" target="_blank" rel="noopener" className="text-green-600 hover:text-green-700">
                  Evin2u.com
                </a> - Online medical equipment store
              </li>
              <li>
                <Link href="/" className="text-green-600 hover:text-green-700">
                  ChatUncle.my
                </Link> - WhatsApp Business CRM platform
              </li>
            </ul>
            <p>
              All our businesses leverage ChatUncle for customer communication, ensuring
              fast response times and excellent service across all touchpoints.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-900 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Power Your Business with ChatUncle
          </h2>
          <p className="text-xl text-gray-400 mb-8">
            Join the AA Alive Group businesses using ChatUncle for WhatsApp automation.
          </p>
          <Link
            href="/login"
            className="inline-block bg-green-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-green-700 transition-colors"
          >
            Start Free Trial
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-5 gap-8">
            <div className="md:col-span-2">
              <h3 className="font-semibold text-gray-900 mb-4">AA Alive Sdn Bhd</h3>
              <p className="text-gray-600 text-sm">
                Malaysian technology and healthcare company serving businesses and consumers
                with innovative solutions since 2018.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">Healthcare</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="https://katil-hospital.my" target="_blank" rel="noopener" className="hover:text-green-600">Katil Hospital</a></li>
                <li><a href="https://oxygenconcentrator.my" target="_blank" rel="noopener" className="hover:text-green-600">Oxygen Concentrator</a></li>
                <li><a href="https://electric-wheelchair.my" target="_blank" rel="noopener" className="hover:text-green-600">Electric Wheelchair</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">Platforms</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="https://evin.my" target="_blank" rel="noopener" className="hover:text-green-600">Evin.my</a></li>
                <li><a href="https://evin2u.com" target="_blank" rel="noopener" className="hover:text-green-600">Evin2u.com</a></li>
                <li><Link href="/" className="hover:text-green-600">ChatUncle.my</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">Resources</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><Link href="/blog" className="hover:text-green-600">Blog</Link></li>
                <li><Link href="/login" className="hover:text-green-600">Login</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-gray-200 text-center text-sm text-gray-500">
            <p>&copy; {new Date().getFullYear()} AA Alive Sdn Bhd. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
