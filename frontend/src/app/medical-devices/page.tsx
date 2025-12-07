import { Metadata } from 'next';
import Link from 'next/link';
import {
  MessageSquare,
  Stethoscope,
  Heart,
  Armchair,
  Activity,
  Bed,
  Wind,
  ArrowRight,
  Check,
  Star,
  Phone,
  Shield,
  Truck,
  Award,
  Monitor,
  Zap,
  Radio,
  Scan,
  Beaker,
  Siren,
  Box,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Medical Devices Malaysia | Hospital Equipment Supplier | AA Alive Sdn Bhd',
  description: 'Malaysia\'s trusted medical device supplier. Hospital beds, oxygen concentrators, electric wheelchairs, anti-embolism stockings, compression stockings. Free delivery KL & Selangor. Superbrands 2025 award winner.',
  keywords: [
    'medical devices malaysia',
    'hospital equipment supplier malaysia',
    'medical equipment supplier',
    'healthcare equipment malaysia',
    'patient monitor malaysia',
    'vital sign monitor',
    'ECG machine malaysia',
    'defibrillator supplier',
    'portable ultrasound malaysia',
    'urine analyser malaysia',
    'crash cart equipment',
    'hospital bed supplier',
    'rapha medical alternative',
    'medi-life alternative',
    'AA Alive Sdn Bhd',
    'medical device distributor',
  ],
  alternates: {
    canonical: 'https://chatuncle.my/medical-devices',
  },
  openGraph: {
    title: 'Medical Devices Malaysia | AA Alive Sdn Bhd - Superbrands 2025',
    description: 'Malaysia\'s trusted medical device supplier. Hospital beds, oxygen concentrators, wheelchairs, compression stockings. Free delivery.',
    url: 'https://chatuncle.my/medical-devices',
    type: 'website',
    images: [{ url: '/og-medical-devices.png', width: 1200, height: 630 }],
  },
};

const productCategories = [
  {
    name: 'Anti-Embolism Stockings',
    slug: 'anti-embolism-stockings',
    description: 'Medical-grade anti-embolism stockings for DVT prevention, post-surgery recovery, and bedridden patients. TED stockings available.',
    icon: Activity,
    color: 'bg-red-500',
    keywords: ['stoking anti embolism', 'TED stockings', 'DVT prevention stockings'],
    features: ['18-23 mmHg compression', 'Knee & thigh length', 'Post-surgery care', 'Hospital grade'],
    price: 'From RM 45',
    link: '/medical-devices/anti-embolism-stockings',
  },
  {
    name: 'Compression Stockings',
    slug: 'compression-stockings',
    description: 'Graduated compression stockings for varicose veins, edema, and leg fatigue. Medical and everyday wear options.',
    icon: Heart,
    color: 'bg-purple-500',
    keywords: ['stoking mampatan', 'varicose vein stockings', 'compression socks'],
    features: ['15-40 mmHg options', 'Class I-III medical', 'Travel compression', 'Sports recovery'],
    price: 'From RM 35',
    link: '/medical-devices/compression-stockings',
  },
  {
    name: 'Hospital Beds',
    slug: 'hospital-beds',
    description: 'Electric and manual hospital beds for home care and medical facilities. Rental and purchase options available.',
    icon: Bed,
    color: 'bg-blue-500',
    keywords: ['katil hospital', 'hospital bed malaysia', 'medical bed rental'],
    features: ['Electric & manual', 'Home care beds', 'ICU beds', 'Rental available'],
    price: 'From RM 1,500',
    link: 'https://katil-hospital.my',
    external: true,
  },
  {
    name: 'Oxygen Concentrators',
    slug: 'oxygen-concentrators',
    description: 'Home oxygen therapy equipment for COPD, respiratory conditions, and post-COVID recovery. Portable and stationary units.',
    icon: Wind,
    color: 'bg-teal-500',
    keywords: ['mesin oksigen', 'oxygen concentrator malaysia', 'home oxygen therapy'],
    features: ['5L-10L capacity', 'Portable units', '24/7 operation', 'Low maintenance'],
    price: 'From RM 2,800',
    link: 'https://oxygenconcentrator.my',
    external: true,
  },
  {
    name: 'Electric Wheelchairs',
    slug: 'electric-wheelchairs',
    description: 'Premium electric wheelchairs and mobility scooters for seniors and individuals with disabilities.',
    icon: Armchair,
    color: 'bg-orange-500',
    keywords: ['kerusi roda elektrik', 'electric wheelchair malaysia', 'mobility scooter'],
    features: ['Lightweight frames', 'Long battery life', 'Foldable designs', 'Test rides available'],
    price: 'From RM 3,500',
    link: 'https://electric-wheelchair.my',
    external: true,
  },
  {
    name: 'Patient Care Supplies',
    slug: 'patient-care',
    description: 'Complete range of patient care supplies including adult diapers, bed pads, wound care, and rehabilitation aids.',
    icon: Stethoscope,
    color: 'bg-green-500',
    keywords: ['patient care supplies', 'adult diapers malaysia', 'wound care products'],
    features: ['Adult diapers', 'Bed protection', 'Wound care', 'Mobility aids'],
    price: 'Various',
    link: 'https://evin2u.com',
    external: true,
  },
  {
    name: 'Patient Monitors',
    slug: 'patient-monitors',
    description: 'Vital sign monitors, SpO2 pulse oximeters, multiparameter monitors for hospitals and home care.',
    icon: Monitor,
    color: 'bg-emerald-500',
    keywords: ['patient monitor', 'vital sign monitor', 'SpO2 monitor'],
    features: ['SpO2 monitoring', 'ECG', 'NIBP', 'Multi-parameter'],
    price: 'From RM 45',
    link: '/medical-devices/patient-monitors',
  },
  {
    name: 'ECG Machines & Defibrillators',
    slug: 'ecg-defibrillators',
    description: 'ECG machines, AED defibrillators, and cardiac monitoring equipment for clinics and hospitals.',
    icon: Zap,
    color: 'bg-yellow-500',
    keywords: ['ECG machine malaysia', 'defibrillator supplier', 'AED malaysia'],
    features: ['12-lead ECG', 'AED units', 'Manual defibrillators', 'Cardiac monitors'],
    price: 'From RM 3,500',
    link: '/medical-devices/ecg-defibrillators',
  },
  {
    name: 'Urine Analysers',
    slug: 'urine-analyser',
    description: 'Urine chemistry analysers, sediment analysers, and urinalysis equipment for labs and clinics.',
    icon: Beaker,
    color: 'bg-amber-500',
    keywords: ['urine analyser malaysia', 'urinalysis machine', 'lab equipment'],
    features: ['Semi-automatic', 'Fully automatic', 'Sediment analysis', 'LIS compatible'],
    price: 'From RM 45',
    link: '/medical-devices/urine-analyser',
  },
  {
    name: 'Portable Ultrasound',
    slug: 'portable-ultrasound',
    description: 'Portable and handheld ultrasound machines for point-of-care diagnostics and mobile clinics.',
    icon: Radio,
    color: 'bg-indigo-500',
    keywords: ['portable ultrasound', 'handheld ultrasound', 'ultrasound malaysia'],
    features: ['Portable units', 'Multiple probes', 'Color Doppler', 'Wireless connectivity'],
    price: 'From RM 15,000',
    link: '/medical-devices/portable-ultrasound',
  },
  {
    name: 'X-Ray Equipment',
    slug: 'xray-equipment',
    description: 'Mobile X-ray machines, digital radiography systems, and imaging equipment for clinics.',
    icon: Scan,
    color: 'bg-slate-500',
    keywords: ['mobile xray', 'digital xray malaysia', 'radiography equipment'],
    features: ['Mobile units', 'Digital DR', 'CR systems', 'PACS ready'],
    price: 'From RM 80,000',
    link: '/medical-devices/xray-equipment',
  },
  {
    name: 'OT & Emergency Equipment',
    slug: 'ot-emergency',
    description: 'Operating theatre equipment, suction machines, crash carts, and emergency medical supplies.',
    icon: Siren,
    color: 'bg-rose-500',
    keywords: ['crash cart', 'OT suction', 'emergency equipment malaysia'],
    features: ['Crash carts', 'Suction machines', 'Anesthesia equipment', 'OT tables'],
    price: 'From RM 2,500',
    link: '/medical-devices/ot-emergency',
  },
  {
    name: 'Hospital Beds',
    slug: 'hospital-beds',
    description: 'Electric and manual hospital beds for home care and medical facilities. Rental and purchase available.',
    icon: Bed,
    color: 'bg-blue-600',
    keywords: ['katil hospital', 'hospital bed rental', 'medical bed'],
    features: ['Electric & manual', 'ICU beds', 'Rental available', 'Free delivery'],
    price: 'From RM 800',
    link: '/medical-devices/hospital-beds',
  },
];

const whyChooseUs = [
  {
    icon: Award,
    title: 'Superbrands 2025 Winner',
    description: 'Recognized as a trusted brand in Malaysia for healthcare equipment.',
  },
  {
    icon: Truck,
    title: 'Free Delivery KL & Selangor',
    description: 'Free setup and delivery within Klang Valley. Nationwide shipping available.',
  },
  {
    icon: Shield,
    title: 'Warranty & Support',
    description: 'All products come with manufacturer warranty and dedicated after-sales support.',
  },
  {
    icon: Phone,
    title: 'WhatsApp Support',
    description: 'Instant consultation via WhatsApp. Powered by ChatUncle CRM.',
  },
];

const testimonials = [
  {
    name: 'Dr. Ahmad Razali',
    role: 'Family Physician, KL',
    content: 'I recommend AA Alive to my patients for home care equipment. Their anti-embolism stockings are hospital-grade quality at affordable prices.',
    rating: 5,
  },
  {
    name: 'Puan Siti Aminah',
    role: 'Caregiver, Selangor',
    content: 'Bought compression stockings for my mother with varicose veins. Excellent quality and the WhatsApp support helped me choose the right size.',
    rating: 5,
  },
  {
    name: 'Hospital Pantai Cheras',
    role: 'Procurement Dept',
    content: 'AA Alive has been our trusted supplier for hospital beds and patient care equipment. Reliable delivery and competitive pricing.',
    rating: 5,
  },
];

// Product schema for SEO
const productListSchema = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Medical Devices Malaysia - AA Alive Sdn Bhd',
  description: 'Complete range of medical devices and healthcare equipment from AA Alive Sdn Bhd',
  numberOfItems: productCategories.length,
  itemListElement: productCategories.map((product, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    item: {
      '@type': 'Product',
      name: product.name,
      description: product.description,
      category: 'Medical Equipment',
      brand: {
        '@type': 'Brand',
        name: 'AA Alive',
      },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'MYR',
        availability: 'https://schema.org/InStock',
        seller: {
          '@type': 'Organization',
          name: 'AA Alive Sdn Bhd',
        },
      },
    },
  })),
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'MedicalBusiness',
  name: 'AA Alive Sdn Bhd',
  description: 'Malaysian medical device supplier specializing in hospital equipment, compression therapy, and home healthcare solutions.',
  url: 'https://chatuncle.my/medical-devices',
  logo: 'https://chatuncle.my/logo.png',
  award: 'Superbrands Malaysia 2025',
  priceRange: 'RM 35 - RM 15,000',
  address: {
    '@type': 'PostalAddress',
    addressCountry: 'MY',
    addressRegion: 'Selangor',
  },
  areaServed: {
    '@type': 'Country',
    name: 'Malaysia',
  },
  sameAs: [
    'https://katil-hospital.my',
    'https://oxygenconcentrator.my',
    'https://electric-wheelchair.my',
    'https://evin.my',
    'https://evin2u.com',
  ],
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Medical Devices Catalog',
    itemListElement: [
      {
        '@type': 'OfferCatalog',
        name: 'Compression Therapy',
        itemListElement: ['Anti-Embolism Stockings', 'Compression Stockings', 'DVT Prevention'],
      },
      {
        '@type': 'OfferCatalog',
        name: 'Hospital Equipment',
        itemListElement: ['Hospital Beds', 'Patient Monitors', 'Medical Furniture'],
      },
      {
        '@type': 'OfferCatalog',
        name: 'Respiratory Equipment',
        itemListElement: ['Oxygen Concentrators', 'CPAP Machines', 'Nebulizers'],
      },
      {
        '@type': 'OfferCatalog',
        name: 'Mobility Equipment',
        itemListElement: ['Electric Wheelchairs', 'Manual Wheelchairs', 'Mobility Scooters'],
      },
    ],
  },
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is the difference between anti-embolism stockings and compression stockings?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Anti-embolism stockings (TED stockings) are designed for bedridden or post-surgery patients to prevent blood clots (DVT). They typically have 18-23 mmHg compression. Compression stockings are for ambulatory patients with varicose veins, edema, or leg fatigue, available in various compression levels (15-40 mmHg).',
      },
    },
    {
      '@type': 'Question',
      name: 'Do you deliver medical equipment throughout Malaysia?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, AA Alive Sdn Bhd delivers medical equipment throughout Malaysia. We offer FREE delivery and setup within Klang Valley (KL & Selangor). For other states, shipping charges apply based on location and product size.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I rent hospital beds instead of buying?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, we offer hospital bed rental services starting from RM 200/month. Rental includes delivery, setup, and basic maintenance. Visit katil-hospital.my for rental options.',
      },
    },
    {
      '@type': 'Question',
      name: 'Are your medical devices registered with MDA Malaysia?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, all medical devices sold by AA Alive Sdn Bhd are registered with the Medical Device Authority (MDA) Malaysia and comply with Malaysian medical device regulations.',
      },
    },
  ],
};

export default function MedicalDevicesPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productListSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-2">
              <div className="bg-green-600 p-2 rounded-lg">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold text-gray-900">AA Alive</span>
                <span className="hidden sm:inline text-sm text-gray-500 ml-2">Medical Devices</span>
              </div>
            </Link>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <Link href="/partners" className="hidden sm:block text-gray-600 hover:text-gray-900 text-sm">
                All Products
              </Link>
              <a
                href="https://wa.me/60123456789"
                className="bg-green-600 text-white px-3 py-2 sm:px-4 rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
              >
                WhatsApp Us
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="bg-gradient-to-r from-blue-900 to-blue-700 py-12 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:flex lg:items-center lg:justify-between">
            <div className="lg:w-2/3">
              <div className="flex items-center space-x-2 mb-4">
                <Award className="h-6 w-6 text-yellow-400" />
                <span className="text-yellow-400 font-semibold">Superbrands Malaysia 2025</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
                Medical Devices &amp; Hospital Equipment
                <span className="text-blue-300"> Supplier Malaysia</span>
              </h1>
              <p className="mt-4 text-lg sm:text-xl text-blue-100 max-w-2xl">
                Your trusted source for <strong>anti-embolism stockings</strong>, <strong>compression stockings</strong>,
                hospital beds, oxygen concentrators, and mobility equipment. Serving hospitals, clinics, and home care across Malaysia.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-4">
                <a
                  href="#products"
                  className="inline-flex items-center justify-center bg-white text-blue-900 px-6 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
                >
                  Browse Products
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
                <a
                  href="https://wa.me/60123456789"
                  className="inline-flex items-center justify-center border-2 border-white text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors"
                >
                  <Phone className="mr-2 h-5 w-5" />
                  Get Quote via WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Trust Indicators */}
      <section className="bg-white py-6 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-blue-600">500+</span>
              <span className="text-sm text-gray-600">Hospitals Served</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-blue-600">10,000+</span>
              <span className="text-sm text-gray-600">Products Delivered</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-blue-600">15+</span>
              <span className="text-sm text-gray-600">Years Experience</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-blue-600">4.9/5</span>
              <span className="text-sm text-gray-600">Customer Rating</span>
            </div>
          </div>
        </div>
      </section>

      {/* Product Categories */}
      <section id="products" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Medical Equipment Categories
          </h2>
          <p className="mt-3 text-gray-600 max-w-2xl mx-auto">
            From compression therapy to mobility solutions, we provide comprehensive medical equipment for hospitals, clinics, and home care.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {productCategories.map((product) => (
            <article
              key={product.slug}
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-all group"
            >
              <div className={`${product.color} p-5`}>
                <div className="flex items-center justify-between">
                  <product.icon className="h-8 w-8 text-white" />
                  <span className="bg-white/20 text-white text-xs px-3 py-1 rounded-full">
                    {product.price}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white mt-3">
                  {product.name}
                </h3>
              </div>
              <div className="p-5">
                <p className="text-gray-600 text-sm mb-4">
                  {product.description}
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {product.features.map((feature, i) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                      {feature}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-gray-400 mb-4">
                  Keywords: {product.keywords.join(', ')}
                </div>
                {product.external ? (
                  <a
                    href={product.link}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center text-blue-600 font-medium hover:text-blue-700 group-hover:underline"
                  >
                    Shop Now
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </a>
                ) : (
                  <Link
                    href={product.link}
                    className="inline-flex items-center text-blue-600 font-medium hover:text-blue-700 group-hover:underline"
                  >
                    View Details
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="bg-blue-900 py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              Why Choose AA Alive for Medical Devices?
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {whyChooseUs.map((item, index) => (
              <div key={index} className="bg-white/10 rounded-xl p-6 text-center">
                <item.icon className="h-10 w-10 text-yellow-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-blue-200 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured: Compression Therapy */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="lg:flex lg:items-center lg:gap-12">
          <div className="lg:w-1/2 mb-8 lg:mb-0">
            <span className="text-red-600 font-semibold text-sm uppercase tracking-wide">Featured Category</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-2">
              Anti-Embolism &amp; Compression Stockings
            </h2>
            <p className="mt-4 text-gray-600">
              Medical-grade compression therapy for DVT prevention, varicose veins, and post-surgery recovery.
              Our stockings meet international standards and are used by major hospitals across Malaysia.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'TED stockings for post-operative care',
                'Graduated compression 15-40 mmHg',
                'Knee-high, thigh-high, and pantyhose styles',
                'Open toe and closed toe options',
                'Sizing guide and fitting assistance',
                'Bulk pricing for hospitals and clinics',
              ].map((item, i) => (
                <li key={i} className="flex items-start">
                  <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/medical-devices/anti-embolism-stockings"
                className="inline-flex items-center bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                Anti-Embolism Stockings
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <Link
                href="/medical-devices/compression-stockings"
                className="inline-flex items-center border-2 border-purple-600 text-purple-600 px-6 py-3 rounded-lg font-semibold hover:bg-purple-50 transition-colors"
              >
                Compression Stockings
              </Link>
            </div>
          </div>
          <div className="lg:w-1/2">
            <div className="bg-gradient-to-br from-red-100 to-purple-100 rounded-2xl p-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <Activity className="h-8 w-8 text-red-500 mb-2" />
                  <h4 className="font-semibold text-gray-900">Anti-Embolism</h4>
                  <p className="text-sm text-gray-500">18-23 mmHg</p>
                  <p className="text-lg font-bold text-red-600 mt-2">From RM 45</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <Heart className="h-8 w-8 text-purple-500 mb-2" />
                  <h4 className="font-semibold text-gray-900">Compression</h4>
                  <p className="text-sm text-gray-500">15-40 mmHg</p>
                  <p className="text-lg font-bold text-purple-600 mt-2">From RM 35</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm col-span-2">
                  <h4 className="font-semibold text-gray-900 mb-2">Popular Brands</h4>
                  <div className="flex flex-wrap gap-2">
                    {['Sigvaris', 'Jobst', 'Medi', 'Venosan', 'Juzo'].map((brand) => (
                      <span key={brand} className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {brand}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-gray-100 py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Trusted by Healthcare Professionals
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <article key={index} className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex mb-3">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-gray-600 mb-4">&ldquo;{testimonial.content}&rdquo;</p>
                <div>
                  <p className="font-semibold text-gray-900">{testimonial.name}</p>
                  <p className="text-sm text-gray-500">{testimonial.role}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {faqSchema.mainEntity.map((faq, index) => (
            <details key={index} className="bg-white rounded-lg shadow-sm border border-gray-100 group">
              <summary className="p-4 cursor-pointer font-medium text-gray-900 hover:text-blue-600">
                {faq.name}
              </summary>
              <div className="px-4 pb-4 text-gray-600">
                {faq.acceptedAnswer.text}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-green-600 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Need Medical Equipment? WhatsApp Us Now
          </h2>
          <p className="mt-4 text-green-100 text-lg">
            Get instant quotes, product recommendations, and same-day delivery in KL/Selangor.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://wa.me/60123456789"
              className="inline-flex items-center bg-white text-green-600 px-8 py-4 rounded-lg font-semibold hover:bg-green-50 transition-colors"
            >
              <MessageSquare className="mr-2 h-5 w-5" />
              WhatsApp: +60 12-345 6789
            </a>
            <Link
              href="/partners"
              className="inline-flex items-center border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white/10 transition-colors"
            >
              View All AA Alive Businesses
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2">
              <h3 className="text-white font-bold text-lg mb-4">AA Alive Sdn Bhd</h3>
              <p className="text-gray-400 text-sm mb-4">
                Malaysia&apos;s trusted medical device supplier. Superbrands 2025 award winner.
                Serving hospitals, clinics, and home care nationwide.
              </p>
              <p className="text-gray-500 text-xs">
                SSM Registered | MDA Compliant | ISO Certified Partner
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Products</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/medical-devices/anti-embolism-stockings" className="hover:text-white">Anti-Embolism Stockings</Link></li>
                <li><Link href="/medical-devices/compression-stockings" className="hover:text-white">Compression Stockings</Link></li>
                <li><a href="https://katil-hospital.my" target="_blank" rel="noopener" className="hover:text-white">Hospital Beds</a></li>
                <li><a href="https://oxygenconcentrator.my" target="_blank" rel="noopener" className="hover:text-white">Oxygen Concentrators</a></li>
                <li><a href="https://electric-wheelchair.my" target="_blank" rel="noopener" className="hover:text-white">Electric Wheelchairs</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Our Websites</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="https://evin.my" target="_blank" rel="noopener" className="hover:text-white">Evin.my</a></li>
                <li><a href="https://evin2u.com" target="_blank" rel="noopener" className="hover:text-white">Evin2u.com</a></li>
                <li><a href="https://katil-hospital.my" target="_blank" rel="noopener" className="hover:text-white">Katil-Hospital.my</a></li>
                <li><a href="https://oxygenconcentrator.my" target="_blank" rel="noopener" className="hover:text-white">OxygenConcentrator.my</a></li>
                <li><a href="https://electric-wheelchair.my" target="_blank" rel="noopener" className="hover:text-white">Electric-Wheelchair.my</a></li>
                <li><Link href="/" className="hover:text-white">ChatUncle.my</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-800 text-center text-sm text-gray-500">
            <p>&copy; {new Date().getFullYear()} AA Alive Sdn Bhd. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
