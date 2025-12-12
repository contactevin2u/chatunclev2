import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Calendar, Clock, Tag, MessageSquare } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Blog - WhatsApp Business Tips & Industry Insights | ChatUncle Malaysia',
  description: 'Expert guides on WhatsApp Business automation, customer service tips, and industry insights for Malaysian businesses. Learn how to boost sales with WhatsApp CRM.',
  keywords: [
    'whatsapp business tips',
    'whatsapp marketing guide',
    'customer service automation',
    'business messaging malaysia',
    'crm best practices',
  ],
  alternates: {
    canonical: 'https://chatuncle.my/blog',
  },
};

const blogPosts = [
  {
    slug: 'healthcare-whatsapp-automation',
    title: 'How Healthcare Businesses in Malaysia Use WhatsApp for Patient Communication',
    excerpt: 'Discover how hospitals, clinics, and medical equipment suppliers use WhatsApp automation to improve patient care and boost sales. From appointment reminders to equipment inquiries.',
    category: 'Healthcare',
    date: '2024-12-05',
    readTime: '8 min read',
    featured: true,
  },
  {
    slug: 'ecommerce-whatsapp-sales',
    title: 'Boost Your E-Commerce Sales with WhatsApp Business Automation',
    excerpt: 'Learn proven strategies Malaysian e-commerce businesses use to increase conversions through WhatsApp. Order updates, cart recovery, and customer support automation.',
    category: 'E-Commerce',
    date: '2024-12-03',
    readTime: '6 min read',
    featured: true,
  },
  {
    slug: 'multi-account-whatsapp-management',
    title: 'Managing Multiple WhatsApp Business Accounts: Complete Guide 2024',
    excerpt: 'Running multiple businesses or locations? Learn how to efficiently manage multiple WhatsApp accounts from a single dashboard with ChatUncle.',
    category: 'Guide',
    date: '2024-12-01',
    readTime: '5 min read',
    featured: false,
  },
  {
    slug: 'ai-auto-reply-setup',
    title: 'Setting Up AI Auto-Reply for 24/7 Customer Service',
    excerpt: 'Step-by-step guide to configuring intelligent auto-replies that understand customer intent and provide accurate responses around the clock.',
    category: 'Tutorial',
    date: '2024-11-28',
    readTime: '7 min read',
    featured: false,
  },
  {
    slug: 'medical-equipment-business-whatsapp',
    title: 'WhatsApp Strategies for Medical Equipment Suppliers in Malaysia',
    excerpt: 'How suppliers of hospital beds, oxygen concentrators, and wheelchairs use WhatsApp to reach customers and provide support. Real case studies included.',
    category: 'Healthcare',
    date: '2024-11-25',
    readTime: '10 min read',
    featured: true,
  },
  {
    slug: 'whatsapp-team-inbox',
    title: 'Team Inbox: Collaborate on Customer Messages Without Missing Any',
    excerpt: 'Learn how multiple team members can handle WhatsApp conversations efficiently with assignment, labels, and notes features.',
    category: 'Features',
    date: '2024-11-22',
    readTime: '5 min read',
    featured: false,
  },
];

export default function BlogPage() {
  const featuredPosts = blogPosts.filter(post => post.featured);
  const recentPosts = blogPosts.filter(post => !post.featured);

  return (
    <div className="min-h-screen bg-gray-50">
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
              <Link href="/blog" className="text-green-600 font-medium">Blog</Link>
              <Link href="/login" className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="bg-white py-12 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            ChatUncle Blog
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl">
            Expert insights on WhatsApp Business automation, customer service tips,
            and success stories from Malaysian businesses across industries.
          </p>
        </div>
      </header>

      {/* Featured Posts */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">Featured Articles</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {featuredPosts.map((post) => (
            <article key={post.slug} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-48 bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center">
                <Tag className="h-16 w-16 text-white/50" />
              </div>
              <div className="p-6">
                <div className="flex items-center space-x-4 text-sm text-gray-500 mb-3">
                  <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-medium">
                    {post.category}
                  </span>
                  <span className="flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    {post.readTime}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
                  {post.title}
                </h3>
                <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                  {post.excerpt}
                </p>
                <Link
                  href={`/blog/${post.slug}`}
                  className="text-green-600 font-medium text-sm flex items-center hover:text-green-700"
                >
                  Read More <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Recent Posts */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">Recent Articles</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {recentPosts.map((post) => (
            <article key={post.slug} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center space-x-4 text-sm text-gray-500 mb-3">
                <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-medium">
                  {post.category}
                </span>
                <span className="flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  {post.date}
                </span>
                <span className="flex items-center">
                  <Clock className="h-4 w-4 mr-1" />
                  {post.readTime}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {post.title}
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                {post.excerpt}
              </p>
              <Link
                href={`/blog/${post.slug}`}
                className="text-green-600 font-medium text-sm flex items-center hover:text-green-700"
              >
                Read Article <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-green-600 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Transform Your WhatsApp Business?
          </h2>
          <p className="text-xl text-green-100 mb-8">
            Join 500+ Malaysian businesses using ChatUncle for customer communication.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center space-x-2 bg-white text-green-600 px-8 py-4 rounded-lg hover:bg-gray-100 transition-colors font-semibold text-lg"
          >
            <span>Start Free Trial</span>
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Footer with Backlinks */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-white font-semibold mb-4">ChatUncle</h3>
              <p className="text-sm">
                Malaysia&apos;s leading WhatsApp Business CRM platform by AA Alive Sdn Bhd.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Resources</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="/blog" className="hover:text-white">Blog</Link></li>
                <li><Link href="/#features" className="hover:text-white">Features</Link></li>
                <li><Link href="/login" className="hover:text-white">Login</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Industries We Serve</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="https://katil-hospital.my" target="_blank" rel="noopener" className="hover:text-white">Healthcare - Hospital Beds</a></li>
                <li><a href="https://oxygenconcentrator.my" target="_blank" rel="noopener" className="hover:text-white">Medical - Oxygen Therapy</a></li>
                <li><a href="https://electric-wheelchair.my" target="_blank" rel="noopener" className="hover:text-white">Mobility - Wheelchairs</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">AA Alive Group</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="https://evin.my" target="_blank" rel="noopener" className="hover:text-white">Evin.my</a></li>
                <li><a href="https://evin2u.com" target="_blank" rel="noopener" className="hover:text-white">Evin2u.com</a></li>
                <li><a href="https://chatuncle.my" className="hover:text-white">ChatUncle.my</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-gray-800 text-center text-sm">
            <p>&copy; {new Date().getFullYear()} AA Alive Sdn Bhd. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
