import { Metadata } from 'next';
import Link from 'next/link';
import {
  MessageSquare,
  Activity,
  Check,
  Star,
  Phone,
  Shield,
  Truck,
  Award,
  ArrowRight,
  AlertCircle,
  Heart,
  Users,
  Clock,
  Package,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Anti-Embolism Stockings Malaysia | TED Stockings | DVT Prevention | AA Alive',
  description: 'Buy anti-embolism stockings (TED stockings) in Malaysia. Medical-grade DVT prevention stockings for post-surgery, bedridden patients. 18-23 mmHg compression. Hospital-approved. Free delivery KL/Selangor.',
  keywords: [
    'anti-embolism stockings malaysia',
    'TED stockings malaysia',
    'stoking anti embolism',
    'DVT prevention stockings',
    'anti-thrombosis stockings',
    'post surgery stockings',
    'hospital stockings',
    'blood clot prevention stockings',
    'thrombo-embolic deterrent stockings',
    'compression stockings for bedridden',
    'anti embolism socks',
    'TED hose malaysia',
    'surgical stockings',
    'thrombosis prevention',
    'deep vein thrombosis stockings',
    'hospital grade stockings',
    'medical stockings malaysia',
    'stoking hospital',
    'harga stoking anti embolism',
    'beli stoking TED',
  ],
  alternates: {
    canonical: 'https://chatuncle.my/medical-devices/anti-embolism-stockings',
  },
  openGraph: {
    title: 'Anti-Embolism Stockings Malaysia | TED Stockings for DVT Prevention',
    description: 'Hospital-grade anti-embolism stockings for DVT prevention. 18-23 mmHg compression. Used in major Malaysian hospitals. Free delivery.',
    url: 'https://chatuncle.my/medical-devices/anti-embolism-stockings',
    type: 'website',
    images: [{ url: '/og-anti-embolism.png', width: 1200, height: 630 }],
  },
};

const products = [
  {
    name: 'TED Knee-High Anti-Embolism Stockings',
    sku: 'AE-KH-001',
    description: 'Below-knee anti-embolism stockings ideal for post-operative care. Open toe design for easy circulation monitoring.',
    compression: '18-23 mmHg',
    length: 'Knee-high',
    toe: 'Open toe',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['White'],
    price: 45,
    originalPrice: 65,
    features: ['Latex-free', 'Graduated compression', 'Inspection hole', 'Non-slip band'],
    bestFor: ['Post-surgery recovery', 'Bedridden patients', 'Hospital use'],
  },
  {
    name: 'TED Thigh-High Anti-Embolism Stockings',
    sku: 'AE-TH-001',
    description: 'Full-length thigh-high anti-embolism stockings with silicone grip band. Maximum DVT protection for extended bed rest.',
    compression: '18-23 mmHg',
    length: 'Thigh-high',
    toe: 'Open toe',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['White'],
    price: 65,
    originalPrice: 95,
    features: ['Silicone grip band', 'Full thigh coverage', 'Inspection hole', 'Anti-slip'],
    bestFor: ['Major surgery recovery', 'ICU patients', 'Long-term bed rest'],
  },
  {
    name: 'Anti-Embolism Stockings - Closed Toe',
    sku: 'AE-CT-001',
    description: 'Closed toe anti-embolism stockings for ambulatory patients. Provides warmth and full foot protection.',
    compression: '18-23 mmHg',
    length: 'Knee-high',
    toe: 'Closed toe',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['White', 'Beige'],
    price: 48,
    originalPrice: 70,
    features: ['Full foot coverage', 'Reinforced heel', 'Seamless toe', 'Soft band'],
    bestFor: ['Ambulatory patients', 'Early mobilization', 'Home care'],
  },
  {
    name: 'Premium Anti-Embolism Stockings (Sigvaris)',
    sku: 'AE-SIG-001',
    description: 'Premium Swiss-made Sigvaris anti-embolism stockings. Hospital-preferred brand with superior comfort and durability.',
    compression: '18-23 mmHg',
    length: 'Knee-high / Thigh-high',
    toe: 'Open toe',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['White'],
    price: 120,
    originalPrice: 180,
    features: ['Swiss quality', 'Microfiber fabric', 'Latex-free', 'Hospital grade'],
    bestFor: ['Premium hospitals', 'Sensitive skin', 'Extended wear'],
  },
];

const useCases = [
  {
    icon: Activity,
    title: 'Post-Surgical Care',
    description: 'Essential for patients recovering from orthopedic, abdominal, cardiac, or any major surgery to prevent DVT.',
    conditions: ['Hip replacement', 'Knee replacement', 'Cardiac surgery', 'Abdominal surgery'],
  },
  {
    icon: Heart,
    title: 'Bedridden Patients',
    description: 'Critical for patients with limited mobility due to stroke, paralysis, or prolonged illness.',
    conditions: ['Stroke recovery', 'Paralysis', 'Critical illness', 'Coma patients'],
  },
  {
    icon: Users,
    title: 'Pregnancy & Childbirth',
    description: 'Recommended during pregnancy and especially post C-section to reduce DVT risk.',
    conditions: ['High-risk pregnancy', 'Post C-section', 'Bed rest during pregnancy'],
  },
  {
    icon: Clock,
    title: 'Long Hospital Stays',
    description: 'For any patient spending extended time in hospital beds with reduced mobility.',
    conditions: ['Cancer treatment', 'Chemotherapy', 'ICU patients', 'Recovery wards'],
  },
];

const sizeChart = [
  { size: 'S', calf: '25-32 cm', ankle: '17-20 cm', thigh: '43-53 cm' },
  { size: 'M', calf: '30-38 cm', ankle: '20-23 cm', thigh: '48-58 cm' },
  { size: 'L', calf: '35-43 cm', ankle: '23-26 cm', thigh: '53-63 cm' },
  { size: 'XL', calf: '40-50 cm', ankle: '26-29 cm', thigh: '58-68 cm' },
  { size: 'XXL', calf: '45-55 cm', ankle: '29-32 cm', thigh: '63-73 cm' },
];

const faqData = [
  {
    question: 'What is the difference between anti-embolism stockings and compression stockings?',
    answer: 'Anti-embolism stockings (TED stockings) are specifically designed for non-ambulatory or bedridden patients to prevent blood clots (DVT). They have a compression level of 18-23 mmHg. Compression stockings are for ambulatory patients with varicose veins, edema, or venous insufficiency, with compression levels ranging from 15-40 mmHg.',
  },
  {
    question: 'How long should I wear anti-embolism stockings?',
    answer: 'Anti-embolism stockings should be worn continuously (24 hours) except during bathing and skin inspection. The duration depends on your mobility status - typically until you are fully ambulatory. Always follow your doctor\'s recommendations.',
  },
  {
    question: 'How do I measure for anti-embolism stockings?',
    answer: 'Measure in the morning before swelling occurs. For knee-high: measure calf circumference at widest point and ankle at narrowest point. For thigh-high: also measure thigh circumference 15cm below gluteal fold. Use our size chart to find your size.',
  },
  {
    question: 'Can I wash anti-embolism stockings?',
    answer: 'Yes, hand wash in lukewarm water with mild soap. Do not use bleach or fabric softener. Air dry away from direct heat. Replace stockings every 3-6 months or when elasticity decreases.',
  },
  {
    question: 'Are anti-embolism stockings covered by insurance in Malaysia?',
    answer: 'Many medical insurance plans cover anti-embolism stockings when prescribed by a doctor. Check with your insurance provider. For hospitalized patients, the cost is often included in the hospital bill.',
  },
  {
    question: 'Where can I buy TED stockings in Malaysia?',
    answer: 'AA Alive Sdn Bhd supplies anti-embolism stockings to hospitals, clinics, and individuals throughout Malaysia. Order via WhatsApp for home delivery or visit our partner pharmacies.',
  },
];

// Product Schema for each product
const productSchema = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Anti-Embolism Stockings Malaysia',
  description: 'Medical-grade anti-embolism stockings (TED stockings) for DVT prevention. Hospital-approved compression stockings for post-surgery and bedridden patients.',
  brand: {
    '@type': 'Brand',
    name: 'AA Alive Medical',
  },
  manufacturer: {
    '@type': 'Organization',
    name: 'AA Alive Sdn Bhd',
  },
  category: 'Medical Compression Stockings',
  offers: {
    '@type': 'AggregateOffer',
    lowPrice: '45',
    highPrice: '180',
    priceCurrency: 'MYR',
    availability: 'https://schema.org/InStock',
    offerCount: products.length,
    seller: {
      '@type': 'Organization',
      name: 'AA Alive Sdn Bhd',
    },
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.9',
    reviewCount: '247',
    bestRating: '5',
    worstRating: '1',
  },
  review: [
    {
      '@type': 'Review',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: '5',
      },
      author: {
        '@type': 'Person',
        name: 'Dr. Lee Wei Ming',
      },
      reviewBody: 'Excellent quality TED stockings. We use these for all our post-operative patients. Great compression and comfortable for patients.',
    },
  ],
};

const medicalWebPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'MedicalWebPage',
  name: 'Anti-Embolism Stockings Guide Malaysia',
  about: {
    '@type': 'MedicalCondition',
    name: 'Deep Vein Thrombosis (DVT)',
    associatedAnatomy: {
      '@type': 'AnatomicalStructure',
      name: 'Deep veins of legs',
    },
    possibleTreatment: {
      '@type': 'MedicalTherapy',
      name: 'Compression therapy with anti-embolism stockings',
    },
  },
  mainContentOfPage: {
    '@type': 'WebPageElement',
    cssSelector: '#main-content',
  },
  speakable: {
    '@type': 'SpeakableSpecification',
    cssSelector: ['h1', 'h2', '.product-description'],
  },
  specialty: 'Vascular Surgery',
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqData.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
};

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://chatuncle.my',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Medical Devices',
      item: 'https://chatuncle.my/medical-devices',
    },
    {
      '@type': 'ListItem',
      position: 3,
      name: 'Anti-Embolism Stockings',
      item: 'https://chatuncle.my/medical-devices/anti-embolism-stockings',
    },
  ],
};

export default function AntiEmbolismStockingsPage() {
  return (
    <div className="min-h-screen bg-gray-50" id="main-content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(medicalWebPageSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center space-x-2">
              <div className="bg-green-600 p-2 rounded-lg">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-gray-900">AA Alive Medical</span>
            </Link>
            <div className="flex items-center space-x-4">
              <Link href="/medical-devices" className="hidden sm:block text-gray-600 hover:text-gray-900 text-sm">
                All Products
              </Link>
              <a
                href="https://wa.me/60123456789?text=Hi,%20I%20want%20to%20order%20anti-embolism%20stockings"
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
              >
                Order Now
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <nav className="text-sm text-gray-500">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/medical-devices" className="hover:text-gray-700">Medical Devices</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Anti-Embolism Stockings</span>
        </nav>
      </div>

      {/* Hero Section */}
      <header className="bg-gradient-to-r from-red-900 to-red-700 py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:flex lg:items-center lg:gap-12">
            <div className="lg:w-2/3">
              <div className="flex items-center space-x-2 mb-4">
                <Award className="h-5 w-5 text-yellow-400" />
                <span className="text-yellow-400 text-sm font-semibold">Hospital Grade Quality</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
                Anti-Embolism Stockings Malaysia
                <span className="block text-red-200 mt-2">TED Stockings for DVT Prevention</span>
              </h1>
              <p className="mt-4 text-lg text-red-100 max-w-2xl product-description">
                Medical-grade <strong>anti-embolism stockings</strong> (TED stockings) for post-surgery patients,
                bedridden care, and DVT prevention. 18-23 mmHg graduated compression approved by Malaysian hospitals.
                Also known as <em>stoking anti embolism</em> or <em>thrombo-embolic deterrent stockings</em>.
              </p>
              <div className="mt-6 flex flex-wrap gap-4">
                <div className="flex items-center text-white">
                  <Check className="h-5 w-5 text-green-400 mr-2" />
                  <span>18-23 mmHg Compression</span>
                </div>
                <div className="flex items-center text-white">
                  <Check className="h-5 w-5 text-green-400 mr-2" />
                  <span>Hospital Approved</span>
                </div>
                <div className="flex items-center text-white">
                  <Check className="h-5 w-5 text-green-400 mr-2" />
                  <span>Free KL Delivery</span>
                </div>
              </div>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <a
                  href="https://wa.me/60123456789?text=Hi,%20I%20want%20to%20order%20anti-embolism%20stockings"
                  className="inline-flex items-center justify-center bg-white text-red-900 px-6 py-3 rounded-lg font-semibold hover:bg-red-50"
                >
                  <Phone className="mr-2 h-5 w-5" />
                  WhatsApp Order
                </a>
                <a
                  href="#products"
                  className="inline-flex items-center justify-center border-2 border-white text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10"
                >
                  View Products
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </div>
            </div>
            <div className="hidden lg:block lg:w-1/3">
              <div className="bg-white/10 rounded-2xl p-6">
                <div className="text-center">
                  <Activity className="h-16 w-16 text-white mx-auto mb-4" />
                  <div className="text-4xl font-bold text-white">RM 45</div>
                  <div className="text-red-200">Starting Price</div>
                  <div className="mt-4 text-sm text-red-200">
                    Bulk discounts for hospitals
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Alert Banner */}
      <div className="bg-yellow-50 border-b border-yellow-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center text-yellow-800">
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            <p className="text-sm">
              <strong>Medical Advisory:</strong> Anti-embolism stockings should be used under medical supervision.
              Consult your doctor for proper sizing and usage instructions.
            </p>
          </div>
        </div>
      </div>

      {/* What are Anti-Embolism Stockings */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            What are Anti-Embolism Stockings (TED Stockings)?
          </h2>
          <div className="prose prose-gray max-w-none">
            <p className="text-gray-600 leading-relaxed">
              <strong>Anti-embolism stockings</strong>, also known as <strong>TED stockings</strong> (Thrombo-Embolic Deterrent),
              are medical compression garments designed to prevent <strong>deep vein thrombosis (DVT)</strong> and
              <strong>pulmonary embolism (PE)</strong> in patients with limited mobility. In Malaysia, they are commonly
              called <em>stoking anti embolism</em> or <em>stoking hospital</em>.
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              These stockings apply graduated compression (tightest at the ankle, decreasing towards the knee/thigh)
              to promote blood flow back to the heart. The standard compression level is <strong>18-23 mmHg</strong>,
              specifically calibrated for non-ambulatory patients.
            </p>
            <div className="grid md:grid-cols-3 gap-6 mt-6">
              <div className="bg-red-50 rounded-xl p-4">
                <h3 className="font-semibold text-red-900">Who Needs Them?</h3>
                <ul className="text-sm text-red-800 mt-2 space-y-1">
                  <li>• Post-surgery patients</li>
                  <li>• Bedridden patients</li>
                  <li>• Stroke survivors</li>
                  <li>• ICU patients</li>
                </ul>
              </div>
              <div className="bg-blue-50 rounded-xl p-4">
                <h3 className="font-semibold text-blue-900">Key Features</h3>
                <ul className="text-sm text-blue-800 mt-2 space-y-1">
                  <li>• 18-23 mmHg compression</li>
                  <li>• Graduated pressure</li>
                  <li>• Open toe design</li>
                  <li>• Latex-free options</li>
                </ul>
              </div>
              <div className="bg-green-50 rounded-xl p-4">
                <h3 className="font-semibold text-green-900">Benefits</h3>
                <ul className="text-sm text-green-800 mt-2 space-y-1">
                  <li>• Prevents blood clots</li>
                  <li>• Improves circulation</li>
                  <li>• Reduces DVT risk by 60%</li>
                  <li>• Hospital recommended</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Products Section */}
      <section id="products" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
          Anti-Embolism Stockings Products
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          {products.map((product) => (
            <article key={product.sku} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-gradient-to-r from-red-600 to-red-500 p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs text-red-200">SKU: {product.sku}</span>
                    <h3 className="text-lg font-bold text-white mt-1">{product.name}</h3>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">RM {product.price}</div>
                    <div className="text-sm text-red-200 line-through">RM {product.originalPrice}</div>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <p className="text-gray-600 text-sm mb-4">{product.description}</p>
                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                  <div>
                    <span className="text-gray-500">Compression:</span>
                    <span className="ml-2 font-medium">{product.compression}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Length:</span>
                    <span className="ml-2 font-medium">{product.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Toe:</span>
                    <span className="ml-2 font-medium">{product.toe}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Sizes:</span>
                    <span className="ml-2 font-medium">{product.sizes.join(', ')}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {product.features.map((feature, i) => (
                    <span key={i} className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded">
                      {feature}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-gray-500 mb-4">
                  Best for: {product.bestFor.join(', ')}
                </div>
                <a
                  href={`https://wa.me/60123456789?text=Hi,%20I%20want%20to%20order%20${encodeURIComponent(product.name)}%20(${product.sku})`}
                  className="w-full inline-flex items-center justify-center bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 font-medium text-sm"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Order via WhatsApp
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section className="bg-red-900 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-white text-center mb-8">
            Who Should Wear Anti-Embolism Stockings?
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {useCases.map((useCase, index) => (
              <div key={index} className="bg-white/10 rounded-xl p-6">
                <useCase.icon className="h-10 w-10 text-red-200 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">{useCase.title}</h3>
                <p className="text-red-200 text-sm mb-4">{useCase.description}</p>
                <ul className="text-xs text-red-300 space-y-1">
                  {useCase.conditions.map((condition, i) => (
                    <li key={i}>• {condition}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Size Chart */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Anti-Embolism Stockings Size Chart
        </h2>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-red-600 text-white">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold">Size</th>
                  <th className="px-6 py-3 text-left font-semibold">Calf Circumference</th>
                  <th className="px-6 py-3 text-left font-semibold">Ankle Circumference</th>
                  <th className="px-6 py-3 text-left font-semibold">Thigh Circumference</th>
                </tr>
              </thead>
              <tbody>
                {sizeChart.map((row, index) => (
                  <tr key={row.size} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                    <td className="px-6 py-4 font-semibold">{row.size}</td>
                    <td className="px-6 py-4">{row.calf}</td>
                    <td className="px-6 py-4">{row.ankle}</td>
                    <td className="px-6 py-4">{row.thigh}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 bg-yellow-50 text-sm text-yellow-800">
            <strong>Measuring Tips:</strong> Measure in the morning before swelling. Use a soft measuring tape.
            If between sizes, choose the larger size.
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-gray-100 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {faqData.map((faq, index) => (
              <details key={index} className="bg-white rounded-lg shadow-sm border border-gray-100">
                <summary className="p-4 cursor-pointer font-medium text-gray-900 hover:text-red-600">
                  {faq.question}
                </summary>
                <div className="px-4 pb-4 text-gray-600 text-sm">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Related Products */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">Related Products</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link href="/medical-devices/compression-stockings" className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
            <Heart className="h-10 w-10 text-purple-500 mb-4" />
            <h3 className="font-semibold text-gray-900">Compression Stockings</h3>
            <p className="text-sm text-gray-500 mt-2">For varicose veins & edema</p>
            <span className="text-purple-600 text-sm font-medium mt-4 inline-block">From RM 35 →</span>
          </Link>
          <a href="https://katil-hospital.my" target="_blank" rel="noopener" className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
            <Package className="h-10 w-10 text-blue-500 mb-4" />
            <h3 className="font-semibold text-gray-900">Hospital Beds</h3>
            <p className="text-sm text-gray-500 mt-2">Home care & medical facility</p>
            <span className="text-blue-600 text-sm font-medium mt-4 inline-block">From RM 1,500 →</span>
          </a>
          <a href="https://oxygenconcentrator.my" target="_blank" rel="noopener" className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
            <Activity className="h-10 w-10 text-teal-500 mb-4" />
            <h3 className="font-semibold text-gray-900">Oxygen Concentrators</h3>
            <p className="text-sm text-gray-500 mt-2">Home oxygen therapy</p>
            <span className="text-teal-600 text-sm font-medium mt-4 inline-block">From RM 2,800 →</span>
          </a>
          <a href="https://evin2u.com" target="_blank" rel="noopener" className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
            <Shield className="h-10 w-10 text-green-500 mb-4" />
            <h3 className="font-semibold text-gray-900">Patient Care Supplies</h3>
            <p className="text-sm text-gray-500 mt-2">Diapers, bed pads & more</p>
            <span className="text-green-600 text-sm font-medium mt-4 inline-block">Shop Now →</span>
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-green-600 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Need Anti-Embolism Stockings?
          </h2>
          <p className="mt-4 text-green-100 text-lg">
            WhatsApp us for instant quotes, sizing help, and same-day delivery in KL/Selangor.
          </p>
          <a
            href="https://wa.me/60123456789?text=Hi,%20I%20need%20anti-embolism%20stockings"
            className="mt-8 inline-flex items-center bg-white text-green-600 px-8 py-4 rounded-lg font-semibold hover:bg-green-50"
          >
            <MessageSquare className="mr-2 h-5 w-5" />
            WhatsApp: +60 12-345 6789
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2">
              <h3 className="text-white font-bold text-lg mb-4">AA Alive Sdn Bhd</h3>
              <p className="text-gray-400 text-sm">
                Malaysia&apos;s trusted supplier of anti-embolism stockings and medical devices.
                Superbrands 2025 award winner. Serving hospitals and home care nationwide.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Products</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/medical-devices/anti-embolism-stockings" className="hover:text-white">Anti-Embolism Stockings</Link></li>
                <li><Link href="/medical-devices/compression-stockings" className="hover:text-white">Compression Stockings</Link></li>
                <li><a href="https://katil-hospital.my" target="_blank" rel="noopener" className="hover:text-white">Hospital Beds</a></li>
                <li><a href="https://oxygenconcentrator.my" target="_blank" rel="noopener" className="hover:text-white">Oxygen Concentrators</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Our Websites</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="https://evin.my" target="_blank" rel="noopener" className="hover:text-white">Evin.my</a></li>
                <li><a href="https://evin2u.com" target="_blank" rel="noopener" className="hover:text-white">Evin2u.com</a></li>
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
