import { Metadata } from 'next';
import Link from 'next/link';
import {
  MessageSquare,
  Users,
  Bot,
  BarChart3,
  Clock,
  Shield,
  Smartphone,
  FileText,
  ArrowRight,
  Check,
  Star,
  Zap,
  Globe,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'ChatUncle - Best WhatsApp Business CRM Platform Malaysia | AA Alive Sdn Bhd',
  description: 'ChatUncle is Malaysia\'s #1 WhatsApp Business CRM platform. Manage multiple WhatsApp accounts, automate customer responses with AI, and boost your sales. Trusted by 500+ Malaysian businesses. Free trial available.',
  keywords: [
    'whatsapp business malaysia',
    'whatsapp crm platform',
    'whatsapp marketing tool',
    'business messaging malaysia',
    'whatsapp automation',
    'multi-account whatsapp',
    'AA Alive Sdn Bhd',
  ],
  alternates: {
    canonical: 'https://chatuncle.my',
  },
};

const features = [
  {
    icon: Smartphone,
    title: 'Multi-Account Management',
    description: 'Connect and manage multiple WhatsApp Business accounts from a single dashboard. Perfect for agencies and enterprises.',
  },
  {
    icon: Bot,
    title: 'AI-Powered Auto-Reply',
    description: 'Intelligent chatbot that learns from your knowledge base to provide accurate, instant responses 24/7.',
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description: 'Shared inbox for your team with assignment, notes, and labels. Never miss a customer inquiry.',
  },
  {
    icon: FileText,
    title: 'Message Templates',
    description: 'Create and use quick reply templates with shortcuts for faster, consistent customer communication.',
  },
  {
    icon: Clock,
    title: 'Scheduled Messages',
    description: 'Schedule messages for the perfect time. Automate follow-ups and never forget important dates.',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    description: 'Track response times, message volumes, and team performance with detailed analytics.',
  },
];

const benefits = [
  'Increase response rate by 300%',
  'Reduce customer wait time by 80%',
  'Handle 10x more conversations',
  'Works on desktop and mobile',
  'No coding required',
  'Malaysian local support',
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="bg-green-600 p-2 rounded-lg">
                <MessageSquare className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
              <span className="text-xl font-bold text-gray-900">ChatUncle</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/login"
                className="text-gray-600 hover:text-gray-900 font-medium"
              >
                Login
              </Link>
              <Link
                href="/login"
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Get Started Free
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
            Malaysia&apos;s #1 WhatsApp Business
            <span className="text-green-600"> CRM Platform</span>
          </h1>
          <p className="mt-6 text-xl text-gray-600 max-w-3xl mx-auto">
            Manage multiple WhatsApp accounts, automate customer responses with AI,
            and boost your sales. Trusted by 500+ Malaysian businesses including healthcare,
            e-commerce, and service industries.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="w-full sm:w-auto bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 transition-colors font-semibold text-lg flex items-center justify-center space-x-2"
            >
              <span>Start Free Trial</span>
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
            <Link
              href="#features"
              className="w-full sm:w-auto border-2 border-green-600 text-green-600 px-8 py-3 rounded-lg hover:bg-green-50 transition-colors font-semibold text-lg"
            >
              See Features
            </Link>
          </div>
          <div className="mt-8 flex items-center justify-center space-x-6 text-sm text-gray-500">
            <div className="flex items-center space-x-1">
              <Check className="h-5 w-5 text-green-500" aria-hidden="true" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center space-x-1">
              <Check className="h-5 w-5 text-green-500" aria-hidden="true" />
              <span>14-day free trial</span>
            </div>
            <div className="flex items-center space-x-1">
              <Check className="h-5 w-5 text-green-500" aria-hidden="true" />
              <span>Cancel anytime</span>
            </div>
          </div>
        </div>
      </header>

      {/* Trust Badges */}
      <section className="bg-white py-8 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-8 text-gray-400">
            <div className="flex items-center space-x-2">
              <Shield className="h-6 w-6" aria-hidden="true" />
              <span className="font-medium">SSM Registered</span>
            </div>
            <div className="flex items-center space-x-2">
              <Star className="h-6 w-6 text-yellow-500" aria-hidden="true" />
              <span className="font-medium">4.8/5 Rating</span>
            </div>
            <div className="flex items-center space-x-2">
              <Users className="h-6 w-6" aria-hidden="true" />
              <span className="font-medium">500+ Businesses</span>
            </div>
            <div className="flex items-center space-x-2">
              <Zap className="h-6 w-6" aria-hidden="true" />
              <span className="font-medium">99.9% Uptime</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Powerful Features for Your WhatsApp Business
          </h2>
          <p className="mt-4 text-xl text-gray-600 max-w-2xl mx-auto">
            Everything you need to manage customer conversations at scale.
            Built for Malaysian businesses by AA Alive Sdn Bhd.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <article key={index} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <feature.icon className="h-6 w-6 text-green-600" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {feature.title}
              </h3>
              <p className="text-gray-600">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Benefits Section */}
      <section className="bg-green-600 py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:flex lg:items-center lg:justify-between">
            <div className="lg:w-1/2">
              <h2 className="text-3xl sm:text-4xl font-bold text-white">
                Why Malaysian Businesses Choose ChatUncle
              </h2>
              <p className="mt-4 text-xl text-green-100">
                Join hundreds of Malaysian businesses already using ChatUncle
                to transform their WhatsApp customer service.
              </p>
            </div>
            <div className="mt-8 lg:mt-0 lg:w-1/2 lg:pl-16">
              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-center space-x-3">
                    <div className="bg-white/20 rounded-full p-1">
                      <Check className="h-5 w-5 text-white" aria-hidden="true" />
                    </div>
                    <span className="text-lg text-white">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Perfect for Every Industry
          </h2>
          <p className="mt-4 text-xl text-gray-600 max-w-2xl mx-auto">
            ChatUncle helps businesses across Malaysia streamline their WhatsApp communication.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <article className="bg-gradient-to-br from-blue-50 to-white p-6 rounded-xl border border-blue-100">
            <h3 className="font-semibold text-gray-900 mb-2">Healthcare</h3>
            <p className="text-sm text-gray-600">
              Appointment reminders, patient follow-ups, and medical equipment inquiries.
            </p>
          </article>
          <article className="bg-gradient-to-br from-purple-50 to-white p-6 rounded-xl border border-purple-100">
            <h3 className="font-semibold text-gray-900 mb-2">E-Commerce</h3>
            <p className="text-sm text-gray-600">
              Order updates, product inquiries, and customer support automation.
            </p>
          </article>
          <article className="bg-gradient-to-br from-orange-50 to-white p-6 rounded-xl border border-orange-100">
            <h3 className="font-semibold text-gray-900 mb-2">Real Estate</h3>
            <p className="text-sm text-gray-600">
              Property listings, viewing schedules, and client follow-ups.
            </p>
          </article>
          <article className="bg-gradient-to-br from-teal-50 to-white p-6 rounded-xl border border-teal-100">
            <h3 className="font-semibold text-gray-900 mb-2">Services</h3>
            <p className="text-sm text-gray-600">
              Booking confirmations, service updates, and customer feedback.
            </p>
          </article>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gray-900 py-16 lg:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">
            Ready to Transform Your WhatsApp Business?
          </h2>
          <p className="mt-4 text-xl text-gray-300">
            Start your free trial today. No credit card required.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-flex items-center space-x-2 bg-green-600 text-white px-8 py-4 rounded-lg hover:bg-green-700 transition-colors font-semibold text-lg"
          >
            <span>Get Started Free</span>
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Footer with Backlinks */}
      <footer className="bg-gray-50 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8">
            {/* Company Info */}
            <div className="md:col-span-2">
              <div className="flex items-center space-x-2 mb-4">
                <div className="bg-green-600 p-2 rounded-lg">
                  <MessageSquare className="h-5 w-5 text-white" aria-hidden="true" />
                </div>
                <span className="text-lg font-bold text-gray-900">ChatUncle</span>
              </div>
              <p className="text-gray-600 mb-4">
                ChatUncle is developed by <strong>AA Alive Sdn Bhd</strong>, a Malaysian technology company
                specializing in business communication solutions and healthcare equipment distribution.
              </p>
              <p className="text-sm text-gray-500">
                SSM Registration: AA Alive Sdn Bhd
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">Product</h3>
              <ul className="space-y-2 text-gray-600">
                <li><Link href="#features" className="hover:text-green-600">Features</Link></li>
                <li><Link href="/login" className="hover:text-green-600">Login</Link></li>
                <li><Link href="/login" className="hover:text-green-600">Get Started</Link></li>
              </ul>
            </div>

            {/* Partner Sites - Backlinks */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">
                <Globe className="inline h-4 w-4 mr-1" aria-hidden="true" />
                AA Alive Group
              </h3>
              <ul className="space-y-2 text-gray-600">
                <li>
                  <a
                    href="https://katil-hospital.my"
                    target="_blank"
                    rel="noopener"
                    className="hover:text-green-600 flex items-center space-x-1"
                    title="Hospital Beds Malaysia - Katil Hospital"
                  >
                    <span>Katil Hospital Malaysia</span>
                  </a>
                </li>
                <li>
                  <a
                    href="https://oxygenconcentrator.my"
                    target="_blank"
                    rel="noopener"
                    className="hover:text-green-600"
                    title="Oxygen Concentrator Malaysia"
                  >
                    Oxygen Concentrator MY
                  </a>
                </li>
                <li>
                  <a
                    href="https://electric-wheelchair.my"
                    target="_blank"
                    rel="noopener"
                    className="hover:text-green-600"
                    title="Electric Wheelchair Malaysia"
                  >
                    Electric Wheelchair MY
                  </a>
                </li>
                <li>
                  <a
                    href="https://evin.my"
                    target="_blank"
                    rel="noopener"
                    className="hover:text-green-600"
                    title="Evin Malaysia"
                  >
                    Evin.my
                  </a>
                </li>
                <li>
                  <a
                    href="https://evin2u.com"
                    target="_blank"
                    rel="noopener"
                    className="hover:text-green-600"
                    title="Evin2u - Healthcare Solutions"
                  >
                    Evin2u.com
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <p className="text-sm text-gray-500">
                &copy; {new Date().getFullYear()} AA Alive Sdn Bhd. All rights reserved.
              </p>
              <div className="flex items-center space-x-6 text-sm text-gray-500">
                <span>Made with care in Malaysia</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
