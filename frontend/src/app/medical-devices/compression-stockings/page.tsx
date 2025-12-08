import { Metadata } from 'next';
import Link from 'next/link';
import {
  MessageSquare,
  Heart,
  Check,
  Star,
  Phone,
  Shield,
  Award,
  ArrowRight,
  Activity,
  Users,
  Clock,
  Plane,
  Briefcase,
  Baby,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Compression Stockings Malaysia | Varicose Vein Stockings | Medical Grade | AA Alive',
  description: 'Buy compression stockings in Malaysia. Medical-grade graduated compression for varicose veins, edema, leg fatigue. 15-40 mmHg. Sigvaris, Jobst, Medi brands. Free delivery KL/Selangor.',
  keywords: [
    'compression stockings malaysia',
    'stoking mampatan',
    'varicose vein stockings',
    'medical compression socks',
    'graduated compression stockings',
    'compression socks malaysia',
    'stoking varikos',
    'leg compression stockings',
    'support stockings malaysia',
    'edema stockings',
    'travel compression socks',
    'pregnancy compression stockings',
    'sigvaris malaysia',
    'jobst stockings malaysia',
    'medi compression stockings',
    'class 1 compression stockings',
    'class 2 compression stockings',
    'stoking kaki bengkak',
    'harga stoking mampatan',
    'beli compression socks',
  ],
  alternates: {
    canonical: 'https://chatuncle.my/medical-devices/compression-stockings',
  },
  openGraph: {
    title: 'Compression Stockings Malaysia | Varicose Vein & Medical Grade',
    description: 'Medical-grade compression stockings for varicose veins, edema, travel, and everyday leg support. Premium brands available.',
    url: 'https://chatuncle.my/medical-devices/compression-stockings',
    type: 'website',
    images: [{ url: '/og-compression-stockings.png', width: 1200, height: 630 }],
  },
};

const compressionClasses = [
  {
    class: 'Class I (Light)',
    mmHg: '15-20 mmHg',
    description: 'Mild compression for tired legs, minor varicose veins, and travel.',
    bestFor: ['Tired, aching legs', 'Long flights & travel', 'Mild swelling', 'Prevention'],
    prescription: 'No prescription needed',
    color: 'bg-green-500',
  },
  {
    class: 'Class II (Medium)',
    mmHg: '20-30 mmHg',
    description: 'Moderate compression for moderate varicose veins, edema, and post-sclerotherapy.',
    bestFor: ['Moderate varicose veins', 'Edema', 'Post-treatment', 'DVT prevention'],
    prescription: 'Recommended by doctor',
    color: 'bg-blue-500',
  },
  {
    class: 'Class III (Firm)',
    mmHg: '30-40 mmHg',
    description: 'Strong compression for severe varicose veins, chronic venous insufficiency, and lymphedema.',
    bestFor: ['Severe varicose veins', 'Chronic swelling', 'Lymphedema', 'Venous ulcers'],
    prescription: 'Prescription required',
    color: 'bg-purple-500',
  },
  {
    class: 'Class IV (Extra Firm)',
    mmHg: '40-50 mmHg',
    description: 'Maximum compression for severe lymphedema and chronic venous conditions.',
    bestFor: ['Severe lymphedema', 'Post-thrombotic syndrome', 'Chronic venous disease'],
    prescription: 'Prescription required',
    color: 'bg-red-500',
  },
];

const products = [
  {
    name: 'Everyday Compression Socks - Class I',
    sku: 'CS-ED-001',
    description: 'Comfortable everyday compression socks for office workers, travelers, and anyone with tired legs. Stylish designs available.',
    compression: '15-20 mmHg',
    length: 'Knee-high',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Black', 'Beige', 'Navy', 'Gray'],
    price: 35,
    originalPrice: 55,
    features: ['Breathable fabric', 'Reinforced heel & toe', 'Non-binding top', 'Machine washable'],
    bestFor: ['Office workers', 'Travelers', 'Nurses & healthcare workers'],
  },
  {
    name: 'Medical Compression Stockings - Class II',
    sku: 'CS-MED-002',
    description: 'Medical-grade compression stockings for varicose veins, moderate edema, and post-surgical recovery.',
    compression: '20-30 mmHg',
    length: 'Knee-high / Thigh-high',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['Beige', 'Black'],
    price: 85,
    originalPrice: 130,
    features: ['Graduated compression', 'Silicone grip band', 'Open & closed toe options', 'Medical grade'],
    bestFor: ['Varicose veins', 'Edema', 'Post-sclerotherapy'],
  },
  {
    name: 'Sigvaris Essential Comfort',
    sku: 'CS-SIG-001',
    description: 'Premium Swiss-made Sigvaris compression stockings. Superior comfort and durability for daily wear.',
    compression: '20-30 mmHg',
    length: 'Knee-high / Thigh-high / Pantyhose',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Black', 'Natural', 'Nightshade'],
    price: 180,
    originalPrice: 250,
    features: ['Swiss quality', 'Soft microfiber', 'Elegant appearance', 'Long-lasting elasticity'],
    bestFor: ['Professional settings', 'All-day comfort', 'Sensitive skin'],
  },
  {
    name: 'Maternity Compression Pantyhose',
    sku: 'CS-MAT-001',
    description: 'Specially designed compression pantyhose for pregnancy. Supports growing belly while relieving leg discomfort.',
    compression: '15-20 mmHg',
    length: 'Pantyhose',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Beige', 'Black'],
    price: 95,
    originalPrice: 140,
    features: ['Expandable belly panel', 'Cotton gusset', 'Graduated compression', 'Breathable'],
    bestFor: ['Pregnancy support', 'Preventing varicose veins', 'Reducing swelling'],
  },
  {
    name: 'Sports Compression Sleeves',
    sku: 'CS-SPT-001',
    description: 'Athletic compression calf sleeves for sports performance and recovery. Popular among runners and cyclists.',
    compression: '20-30 mmHg',
    length: 'Calf sleeve',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Black', 'White', 'Pink', 'Blue'],
    price: 55,
    originalPrice: 85,
    features: ['Moisture-wicking', 'UV protection', 'Seamless design', 'Quick recovery'],
    bestFor: ['Running', 'Cycling', 'Post-workout recovery'],
  },
  {
    name: 'Heavy-Duty Compression - Class III',
    sku: 'CS-HD-003',
    description: 'Strong compression stockings for severe venous conditions. Doctor-recommended for chronic issues.',
    compression: '30-40 mmHg',
    length: 'Knee-high / Thigh-high',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Beige', 'Black'],
    price: 150,
    originalPrice: 220,
    features: ['Maximum support', 'Durable construction', 'Medical grade', 'Reinforced zones'],
    bestFor: ['Severe varicose veins', 'Lymphedema', 'Chronic venous insufficiency'],
  },
];

const useCases = [
  {
    icon: Briefcase,
    title: 'Office & Desk Workers',
    description: 'Prolonged sitting causes blood pooling in legs. Compression stockings promote circulation.',
    recommendation: 'Class I (15-20 mmHg)',
  },
  {
    icon: Plane,
    title: 'Travelers & Frequent Flyers',
    description: 'Long flights increase DVT risk. Compression socks are essential for air travel over 4 hours.',
    recommendation: 'Class I-II (15-30 mmHg)',
  },
  {
    icon: Baby,
    title: 'Pregnancy',
    description: 'Pregnancy increases blood volume and pressure on leg veins. Support stockings reduce discomfort.',
    recommendation: 'Class I (15-20 mmHg)',
  },
  {
    icon: Activity,
    title: 'Varicose Veins',
    description: 'Compression therapy is first-line treatment for varicose veins and spider veins.',
    recommendation: 'Class II-III (20-40 mmHg)',
  },
  {
    icon: Heart,
    title: 'Chronic Venous Disease',
    description: 'Essential management for chronic venous insufficiency, leg ulcers, and post-thrombotic syndrome.',
    recommendation: 'Class II-IV (20-50 mmHg)',
  },
  {
    icon: Users,
    title: 'Healthcare Workers',
    description: 'Nurses, doctors, and caregivers who stand all day benefit from daily compression wear.',
    recommendation: 'Class I-II (15-30 mmHg)',
  },
];

const brands = [
  { name: 'Sigvaris', country: 'Switzerland', specialty: 'Premium medical compression' },
  { name: 'Jobst', country: 'Germany', specialty: 'Clinical compression therapy' },
  { name: 'Medi', country: 'Germany', specialty: 'Innovative compression solutions' },
  { name: 'Venosan', country: 'Switzerland', specialty: 'Fashionable medical stockings' },
  { name: 'Juzo', country: 'Germany', specialty: 'Custom compression garments' },
];

const faqData = [
  {
    question: 'How do I know which compression level I need?',
    answer: 'For everyday use, travel, or minor leg fatigue, Class I (15-20 mmHg) is suitable. For varicose veins or moderate swelling, Class II (20-30 mmHg) is recommended. Class III and above require medical consultation. When in doubt, consult a doctor or pharmacist.',
  },
  {
    question: 'How long should I wear compression stockings each day?',
    answer: 'For best results, wear compression stockings throughout the day, putting them on first thing in the morning before swelling occurs. Remove them before sleeping unless specifically advised by your doctor.',
  },
  {
    question: 'Can I wear compression stockings during exercise?',
    answer: 'Yes! Sports compression garments are designed for exercise. They can improve performance and speed up recovery. Choose moisture-wicking materials for comfort during workouts.',
  },
  {
    question: 'How do I measure for compression stockings?',
    answer: 'Measure in the morning before swelling. For knee-high: measure ankle at narrowest point, calf at widest point, and length from floor to knee bend. For thigh-high: also measure thigh and leg length.',
  },
  {
    question: 'Are compression stockings safe during pregnancy?',
    answer: 'Yes, compression stockings are safe and recommended during pregnancy. They help prevent varicose veins and reduce leg swelling. Choose maternity-specific styles with expandable belly panels.',
  },
  {
    question: 'How do I care for compression stockings?',
    answer: 'Hand wash in lukewarm water with mild soap, or use a lingerie bag in the washing machine on gentle cycle. Air dry away from direct heat. Having 2-3 pairs allows rotation for daily washing.',
  },
];

const productSchema = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Compression Stockings Malaysia',
  description: 'Medical-grade compression stockings for varicose veins, edema, travel, and everyday leg support. Multiple compression classes available.',
  image: ['https://chatuncle.my/images/compression-stockings.jpg'],
  brand: { '@type': 'Brand', name: 'AA Alive Medical' },
  sku: 'CS-COLLECTION',
  category: 'Medical Compression Stockings',
  offers: {
    '@type': 'AggregateOffer',
    lowPrice: '35',
    highPrice: '250',
    priceCurrency: 'MYR',
    availability: 'https://schema.org/InStock',
    offerCount: products.length,
    priceValidUntil: '2025-12-31',
    url: 'https://chatuncle.my/medical-devices/compression-stockings',
    seller: { '@type': 'Organization', name: 'AA Alive Sdn Bhd' },
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: 'MYR' },
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'MY' },
      deliveryTime: { '@type': 'ShippingDeliveryTime', handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' }, transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' } },
    },
    hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', applicableCountry: 'MY', returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: 7, returnMethod: 'https://schema.org/ReturnByMail', returnFees: 'https://schema.org/FreeReturn' },
  },
  aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: '312', bestRating: '5', worstRating: '1' },
  review: { '@type': 'Review', reviewRating: { '@type': 'Rating', ratingValue: '5', bestRating: '5' }, author: { '@type': 'Person', name: 'Lisa Wong' }, reviewBody: 'Great quality compression stockings. Helped with my varicose veins significantly.' },
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
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://chatuncle.my' },
    { '@type': 'ListItem', position: 2, name: 'Medical Devices', item: 'https://chatuncle.my/medical-devices' },
    { '@type': 'ListItem', position: 3, name: 'Compression Stockings', item: 'https://chatuncle.my/medical-devices/compression-stockings' },
  ],
};

export default function CompressionStockingsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

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
                href="https://wa.me/60123456789?text=Hi,%20I%20want%20to%20order%20compression%20stockings"
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm"
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
          <span className="text-gray-900">Compression Stockings</span>
        </nav>
      </div>

      {/* Hero Section */}
      <header className="bg-gradient-to-r from-purple-900 to-purple-700 py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:flex lg:items-center lg:gap-12">
            <div className="lg:w-2/3">
              <div className="flex items-center space-x-2 mb-4">
                <Award className="h-5 w-5 text-yellow-400" />
                <span className="text-yellow-400 text-sm font-semibold">Premium Brands Available</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
                Compression Stockings Malaysia
                <span className="block text-purple-200 mt-2">Medical Grade for Varicose Veins &amp; More</span>
              </h1>
              <p className="mt-4 text-lg text-purple-100 max-w-2xl">
                Premium <strong>compression stockings</strong> (<em>stoking mampatan</em>) for varicose veins, edema,
                travel, and everyday leg support. Available in 15-40 mmHg compression levels.
                Sigvaris, Jobst, Medi brands. Also known as <em>stoking varikos</em> or <em>support stockings</em>.
              </p>
              <div className="mt-6 flex flex-wrap gap-4">
                <div className="flex items-center text-white">
                  <Check className="h-5 w-5 text-green-400 mr-2" />
                  <span>15-40 mmHg Options</span>
                </div>
                <div className="flex items-center text-white">
                  <Check className="h-5 w-5 text-green-400 mr-2" />
                  <span>Premium Brands</span>
                </div>
                <div className="flex items-center text-white">
                  <Check className="h-5 w-5 text-green-400 mr-2" />
                  <span>Free Sizing Help</span>
                </div>
              </div>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <a
                  href="https://wa.me/60123456789?text=Hi,%20I%20want%20to%20order%20compression%20stockings"
                  className="inline-flex items-center justify-center bg-white text-purple-900 px-6 py-3 rounded-lg font-semibold hover:bg-purple-50"
                >
                  <Phone className="mr-2 h-5 w-5" />
                  WhatsApp Order
                </a>
                <a
                  href="#compression-levels"
                  className="inline-flex items-center justify-center border-2 border-white text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10"
                >
                  Choose Your Level
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </div>
            </div>
            <div className="hidden lg:block lg:w-1/3">
              <div className="bg-white/10 rounded-2xl p-6">
                <div className="text-center">
                  <Heart className="h-16 w-16 text-white mx-auto mb-4" />
                  <div className="text-4xl font-bold text-white">RM 35</div>
                  <div className="text-purple-200">Starting Price</div>
                  <div className="mt-4 text-sm text-purple-200">
                    All compression levels available
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Compression Classes */}
      <section id="compression-levels" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-4">
          Compression Stockings Classes Explained
        </h2>
        <p className="text-gray-600 text-center max-w-2xl mx-auto mb-8">
          Compression is measured in mmHg (millimeters of mercury). Higher numbers mean stronger compression.
          Choose the right class for your needs.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {compressionClasses.map((item) => (
            <div key={item.class} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className={`${item.color} p-4 text-white`}>
                <h3 className="font-bold text-lg">{item.class}</h3>
                <div className="text-2xl font-bold mt-1">{item.mmHg}</div>
              </div>
              <div className="p-4">
                <p className="text-sm text-gray-600 mb-4">{item.description}</p>
                <div className="text-xs text-gray-500 mb-3">{item.prescription}</div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Best For:</h4>
                <ul className="text-xs text-gray-600 space-y-1">
                  {item.bestFor.map((use, i) => (
                    <li key={i} className="flex items-center">
                      <Check className="h-3 w-3 text-green-500 mr-1" />
                      {use}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* What are Compression Stockings */}
      <section className="bg-purple-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:flex lg:items-center lg:gap-12">
            <div className="lg:w-1/2 mb-8 lg:mb-0">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                What are Compression Stockings?
              </h2>
              <div className="prose prose-gray">
                <p className="text-gray-600">
                  <strong>Compression stockings</strong> are specially designed hosiery that apply graduated pressure
                  to your legs. They are tightest at the ankle and gradually decrease pressure up the leg, helping
                  blood flow back to the heart.
                </p>
                <p className="text-gray-600 mt-4">
                  In Malaysia, compression stockings are commonly known as <em>stoking mampatan</em>,
                  <em>stoking varikos</em> (for varicose veins), or <em>support stockings</em>. They are
                  different from anti-embolism stockings, which are for bedridden patients.
                </p>
                <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Benefits:</h3>
                <ul className="text-gray-600 space-y-2">
                  <li>• Reduce leg swelling and fatigue</li>
                  <li>• Prevent and manage varicose veins</li>
                  <li>• Decrease risk of blood clots during travel</li>
                  <li>• Support recovery after leg surgery</li>
                  <li>• Relieve pregnancy-related leg discomfort</li>
                  <li>• Improve athletic performance and recovery</li>
                </ul>
              </div>
            </div>
            <div className="lg:w-1/2">
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">Compression Stockings vs Anti-Embolism</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="p-3 text-left">Feature</th>
                        <th className="p-3 text-left text-purple-600">Compression</th>
                        <th className="p-3 text-left text-red-600">Anti-Embolism</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="p-3 font-medium">Patient Type</td>
                        <td className="p-3">Ambulatory (mobile)</td>
                        <td className="p-3">Bedridden</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3 font-medium">Compression</td>
                        <td className="p-3">15-40+ mmHg</td>
                        <td className="p-3">18-23 mmHg</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3 font-medium">Main Use</td>
                        <td className="p-3">Varicose veins, edema</td>
                        <td className="p-3">DVT prevention</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3 font-medium">Colors</td>
                        <td className="p-3">Multiple options</td>
                        <td className="p-3">Usually white</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Products */}
      <section id="products" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Compression Stockings Products
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <article key={product.sku} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="bg-gradient-to-r from-purple-600 to-purple-500 p-4">
                <div className="flex justify-between items-start">
                  <span className="text-xs text-purple-200">{product.sku}</span>
                  <div className="text-right">
                    <div className="text-xl font-bold text-white">RM {product.price}</div>
                    <div className="text-xs text-purple-200 line-through">RM {product.originalPrice}</div>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white mt-2">{product.name}</h3>
              </div>
              <div className="p-4">
                <p className="text-gray-600 text-sm mb-3">{product.description}</p>
                <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                  <div><span className="text-gray-500">Compression:</span> <span className="font-medium">{product.compression}</span></div>
                  <div><span className="text-gray-500">Length:</span> <span className="font-medium">{product.length}</span></div>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {product.features.map((f, i) => (
                    <span key={i} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">{f}</span>
                  ))}
                </div>
                <div className="text-xs text-gray-500 mb-3">
                  Colors: {product.colors.join(', ')}
                </div>
                <a
                  href={`https://wa.me/60123456789?text=Hi,%20I%20want%20to%20order%20${encodeURIComponent(product.name)}`}
                  className="w-full inline-flex items-center justify-center bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 font-medium text-sm"
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
      <section className="bg-purple-900 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-white text-center mb-8">
            Who Should Wear Compression Stockings?
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {useCases.map((useCase, index) => (
              <div key={index} className="bg-white/10 rounded-xl p-6">
                <useCase.icon className="h-10 w-10 text-purple-200 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">{useCase.title}</h3>
                <p className="text-purple-200 text-sm mb-4">{useCase.description}</p>
                <div className="text-xs text-purple-300">
                  Recommended: <span className="text-white font-medium">{useCase.recommendation}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Brands */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          Premium Brands We Carry
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
          {brands.map((brand) => (
            <div key={brand.name} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
              <h3 className="font-bold text-gray-900">{brand.name}</h3>
              <p className="text-xs text-gray-500 mt-1">{brand.country}</p>
              <p className="text-xs text-purple-600 mt-2">{brand.specialty}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-100 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {faqData.map((faq, index) => (
              <details key={index} className="bg-white rounded-lg shadow-sm border border-gray-100">
                <summary className="p-4 cursor-pointer font-medium text-gray-900 hover:text-purple-600">
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
          <Link href="/medical-devices/anti-embolism-stockings" className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
            <Activity className="h-10 w-10 text-red-500 mb-4" />
            <h3 className="font-semibold text-gray-900">Anti-Embolism Stockings</h3>
            <p className="text-sm text-gray-500 mt-2">For bedridden & post-surgery</p>
            <span className="text-red-600 text-sm font-medium mt-4 inline-block">From RM 45 →</span>
          </Link>
          <a href="https://katil-hospital.my" target="_blank" rel="noopener" className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
            <Shield className="h-10 w-10 text-blue-500 mb-4" />
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
          <a href="https://electric-wheelchair.my" target="_blank" rel="noopener" className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-shadow">
            <Clock className="h-10 w-10 text-orange-500 mb-4" />
            <h3 className="font-semibold text-gray-900">Electric Wheelchairs</h3>
            <p className="text-sm text-gray-500 mt-2">Mobility solutions</p>
            <span className="text-orange-600 text-sm font-medium mt-4 inline-block">From RM 3,500 →</span>
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-green-600 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Need Help Choosing Compression Stockings?
          </h2>
          <p className="mt-4 text-green-100 text-lg">
            WhatsApp us for free sizing advice and product recommendations.
          </p>
          <a
            href="https://wa.me/60123456789?text=Hi,%20I%20need%20help%20choosing%20compression%20stockings"
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
                Malaysia&apos;s trusted supplier of compression stockings and medical devices.
                Premium brands including Sigvaris, Jobst, and Medi.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Products</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/medical-devices/compression-stockings" className="hover:text-white">Compression Stockings</Link></li>
                <li><Link href="/medical-devices/anti-embolism-stockings" className="hover:text-white">Anti-Embolism Stockings</Link></li>
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
