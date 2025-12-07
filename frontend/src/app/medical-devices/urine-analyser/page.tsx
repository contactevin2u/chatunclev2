import { Metadata } from 'next';
import Link from 'next/link';
import {
  MessageSquare,
  Droplets,
  Check,
  Phone,
  Award,
  ArrowRight,
  Beaker,
  FileText,
  Zap,
  Clock,
  Shield,
  Activity,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Urine Analyser Malaysia | Urine Test Machine | Urinalysis | Lab Equipment | AA Alive',
  description: 'Buy urine analyser machines in Malaysia. Semi-automatic & fully automatic urinalysis systems. Urine test strips, urine sediment analyser. Clinic & lab equipment. Better prices than Rapha Medical.',
  keywords: [
    'urine analyser malaysia',
    'urine test machine',
    'urinalysis machine',
    'urine analyzer',
    'urine strip reader',
    'urine sediment analyser',
    'automatic urine analyser',
    'semi-automatic urinalysis',
    'urine chemistry analyser',
    'clinical analyser malaysia',
    'lab equipment malaysia',
    'diagnostic equipment',
    'urine test strips',
    'rapha medical alternative',
    'medical laboratory equipment',
    'harga urine analyser',
    'mesin ujian air kencing',
    'alat analisis urin',
    'clinic laboratory equipment',
    'point of care testing',
  ],
  alternates: {
    canonical: 'https://chatuncle.my/medical-devices/urine-analyser',
  },
  openGraph: {
    title: 'Urine Analyser Malaysia | Lab Equipment | AA Alive',
    description: 'Professional urine analyser machines for clinics and labs. Semi-auto and fully automatic systems available.',
  },
};

const analysers = [
  {
    name: 'Visual Urine Test Strips',
    sku: 'UA-VTS-001',
    type: 'Manual',
    description: 'Professional-grade urine test strips for visual reading. 10-parameter testing for routine urinalysis.',
    parameters: '10 Parameters',
    throughput: 'Manual reading',
    strips: '100 strips/bottle',
    price: 45,
    originalPrice: 70,
    features: ['10-parameter test', 'Color chart included', '2-year shelf life', 'CE marked'],
    bestFor: ['Small clinics', 'Home testing', 'Screening'],
  },
  {
    name: 'Semi-Auto Urine Analyser BT-200',
    sku: 'UA-BT200-001',
    type: 'Semi-Automatic',
    description: 'Entry-level semi-automatic urine analyser with strip reader. Perfect for small clinics and GP practices.',
    parameters: '11 Parameters',
    throughput: '60 tests/hour',
    strips: 'Standard strips compatible',
    price: 2500,
    originalPrice: 3800,
    features: ['Auto calibration', 'LCD display', 'Print function', 'Data storage 1000 results'],
    bestFor: ['GP clinics', 'Small labs', 'Pharmacies'],
    popular: true,
  },
  {
    name: 'Auto Urine Analyser UA-600',
    sku: 'UA-600-001',
    type: 'Fully Automatic',
    description: 'High-throughput fully automatic urine chemistry analyser with built-in printer. LIS connectivity.',
    parameters: '11-14 Parameters',
    throughput: '120 tests/hour',
    strips: 'Proprietary strips',
    price: 8500,
    originalPrice: 12000,
    features: ['Auto strip feeding', 'Touch screen', 'LIS interface', 'QC module'],
    bestFor: ['Medium labs', 'Hospitals', 'Health screening centers'],
  },
  {
    name: 'Urine Sediment Analyser USE-900',
    sku: 'UA-USE900-001',
    type: 'Sediment Analysis',
    description: 'Advanced urine sediment analyser with microscopy imaging. Auto-classification of particles.',
    parameters: 'Sediment + 11 Chemistry',
    throughput: '70 samples/hour',
    strips: 'Cassettes',
    price: 35000,
    originalPrice: 48000,
    features: ['AI image recognition', 'Auto classification', 'Review station', 'Full integration'],
    bestFor: ['Hospital labs', 'Reference labs', 'Large clinics'],
  },
  {
    name: 'POC Urine Analyser Mini',
    sku: 'UA-POC-001',
    type: 'Point of Care',
    description: 'Compact portable urine analyser for point-of-care testing. Battery operated for mobile use.',
    parameters: '10 Parameters',
    throughput: '30 tests/hour',
    strips: 'Standard strips',
    price: 1800,
    originalPrice: 2600,
    features: ['Portable design', 'Battery operated', 'Bluetooth connectivity', 'Mobile app'],
    bestFor: ['Home visits', 'Mobile clinics', 'Emergency response'],
    popular: true,
  },
  {
    name: 'Combo Chemistry+Sediment System',
    sku: 'UA-COMBO-001',
    type: 'Integrated System',
    description: 'Complete urinalysis workstation combining chemistry and sediment analysis. Hospital-grade solution.',
    parameters: '14 Chemistry + Full Sediment',
    throughput: '200+ tests/hour',
    strips: 'Proprietary system',
    price: 85000,
    originalPrice: 120000,
    features: ['Dual-module design', 'Auto sample handling', 'Full LIS', 'Middleware included'],
    bestFor: ['Large hospitals', 'Reference laboratories', 'High-volume testing'],
  },
];

const urineParameters = [
  { name: 'Glucose (GLU)', description: 'Detects diabetes, renal glycosuria' },
  { name: 'Bilirubin (BIL)', description: 'Liver function indicator' },
  { name: 'Ketones (KET)', description: 'Diabetic ketoacidosis, fasting' },
  { name: 'Specific Gravity (SG)', description: 'Kidney concentration ability' },
  { name: 'Blood (BLD)', description: 'UTI, kidney stones, trauma' },
  { name: 'pH', description: 'Acid-base status, UTI' },
  { name: 'Protein (PRO)', description: 'Kidney disease, proteinuria' },
  { name: 'Urobilinogen (URO)', description: 'Liver & hemolytic disorders' },
  { name: 'Nitrite (NIT)', description: 'Bacterial infection indicator' },
  { name: 'Leukocytes (LEU)', description: 'UTI, inflammation' },
];

const faqData = [
  {
    question: 'What is the difference between semi-automatic and fully automatic urine analysers?',
    answer: 'Semi-automatic analysers require manual strip insertion and reading initiation. Fully automatic analysers have auto-feeding mechanisms that process strips continuously with minimal operator intervention, offering higher throughput.',
  },
  {
    question: 'How many parameters can a urine analyser test?',
    answer: 'Most urine analysers test 10-14 chemical parameters including glucose, protein, blood, pH, specific gravity, ketones, bilirubin, urobilinogen, nitrite, and leukocytes. Sediment analysers additionally identify cells, casts, crystals, and bacteria.',
  },
  {
    question: 'What consumables are needed for urine analysers?',
    answer: 'Main consumables include urine test strips (compatible with the analyser model), calibration solutions, control materials for QC, and printer paper. Some analysers use proprietary strips while others accept standard strips.',
  },
  {
    question: 'Can urine analysers connect to laboratory information systems (LIS)?',
    answer: 'Yes, most professional urine analysers support LIS connectivity via RS232, USB, or network connections. They can transmit results directly to your hospital or lab information system.',
  },
];

const productSchema = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Urine Analyser Malaysia - Urinalysis Equipment',
  description: 'Urine analyser machines for clinics and laboratories in Malaysia. Semi-automatic and fully automatic urinalysis systems.',
  brand: { '@type': 'Brand', name: 'AA Alive Medical' },
  category: 'Laboratory Equipment',
  offers: {
    '@type': 'AggregateOffer',
    lowPrice: '45',
    highPrice: '120000',
    priceCurrency: 'MYR',
    availability: 'https://schema.org/InStock',
  },
  aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.7', reviewCount: '89' },
};

export default function UrineAnalyserPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />

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
              <Link href="/medical-devices" className="hidden sm:block text-gray-600 hover:text-gray-900 text-sm">All Products</Link>
              <a href="https://wa.me/60123456789?text=Hi,%20I%20want%20to%20enquire%20about%20urine%20analyser" className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 font-medium text-sm">
                Get Quote
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
          <span className="text-gray-900">Urine Analyser</span>
        </nav>
      </div>

      {/* Hero */}
      <header className="bg-gradient-to-r from-yellow-700 to-yellow-600 py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:flex lg:items-center lg:gap-12">
            <div className="lg:w-2/3">
              <div className="flex items-center space-x-2 mb-4">
                <Award className="h-5 w-5 text-yellow-200" />
                <span className="text-yellow-200 text-sm font-semibold">Laboratory Equipment Specialist</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
                Urine Analyser Malaysia
                <span className="block text-yellow-100 mt-2">Lab &amp; Clinic Urinalysis Equipment</span>
              </h1>
              <p className="mt-4 text-lg text-yellow-50 max-w-2xl">
                Professional <strong>urine analyser</strong> machines for clinics and laboratories. Semi-automatic to fully automatic
                <strong> urinalysis systems</strong>. Urine chemistry and sediment analysis. Competitive vs Rapha Medical.
              </p>
              <div className="mt-6 flex flex-wrap gap-4">
                <div className="flex items-center text-white"><Check className="h-5 w-5 text-green-300 mr-2" /><span>10-14 Parameters</span></div>
                <div className="flex items-center text-white"><Check className="h-5 w-5 text-green-300 mr-2" /><span>LIS Compatible</span></div>
                <div className="flex items-center text-white"><Check className="h-5 w-5 text-green-300 mr-2" /><span>Training Included</span></div>
              </div>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <a href="https://wa.me/60123456789?text=Hi,%20I%20want%20to%20enquire%20about%20urine%20analyser" className="inline-flex items-center justify-center bg-white text-yellow-700 px-6 py-3 rounded-lg font-semibold hover:bg-yellow-50">
                  <Phone className="mr-2 h-5 w-5" />WhatsApp Enquiry
                </a>
                <a href="#products" className="inline-flex items-center justify-center border-2 border-white text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10">
                  View Products<ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </div>
            </div>
            <div className="hidden lg:block lg:w-1/3">
              <div className="bg-white/10 rounded-2xl p-6 text-center">
                <Beaker className="h-16 w-16 text-white mx-auto mb-4" />
                <div className="text-4xl font-bold text-white">RM 45</div>
                <div className="text-yellow-100">Starting (Test Strips)</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Parameters */}
      <section className="bg-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Urine Test Parameters</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {urineParameters.map((param, i) => (
              <div key={i} className="bg-yellow-50 rounded-lg p-4 text-center">
                <Droplets className="h-6 w-6 text-yellow-600 mx-auto mb-2" />
                <h3 className="font-semibold text-gray-900 text-sm">{param.name}</h3>
                <p className="text-xs text-gray-600 mt-1">{param.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products */}
      <section id="products" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Urine Analyser Products</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {analysers.map((analyser) => (
            <article key={analyser.sku} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="bg-gradient-to-r from-yellow-600 to-yellow-500 p-4">
                <div className="flex justify-between items-start">
                  <span className="text-xs text-yellow-200">{analyser.sku}</span>
                  <div className="flex gap-2">
                    <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded">{analyser.type}</span>
                    {analyser.popular && <span className="text-xs bg-green-400 text-green-900 px-2 py-0.5 rounded">Popular</span>}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white mt-2">{analyser.name}</h3>
              </div>
              <div className="p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-2xl font-bold text-yellow-600">RM {analyser.price.toLocaleString()}</span>
                  <span className="text-sm text-gray-400 line-through">RM {analyser.originalPrice.toLocaleString()}</span>
                </div>
                <p className="text-gray-600 text-sm mb-3">{analyser.description}</p>
                <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                  <div><span className="text-gray-500">Parameters:</span> <span className="font-medium">{analyser.parameters}</span></div>
                  <div><span className="text-gray-500">Throughput:</span> <span className="font-medium">{analyser.throughput}</span></div>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {analyser.features.slice(0, 3).map((f, i) => (
                    <span key={i} className="text-xs bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded">{f}</span>
                  ))}
                </div>
                <a href={`https://wa.me/60123456789?text=Hi,%20I%20want%20to%20enquire%20about%20${encodeURIComponent(analyser.name)}`} className="w-full inline-flex items-center justify-center bg-yellow-600 text-white py-2 rounded-lg hover:bg-yellow-700 font-medium text-sm">
                  <MessageSquare className="mr-2 h-4 w-4" />Get Quote
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Why Choose */}
      <section className="bg-yellow-700 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-white text-center mb-8">Why Choose AA Alive for Lab Equipment?</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white/10 rounded-xl p-6 text-center">
              <Zap className="h-10 w-10 text-yellow-200 mx-auto mb-4" />
              <h3 className="font-semibold text-white">Competitive Pricing</h3>
              <p className="text-sm text-yellow-100 mt-2">Better prices than Rapha Medical with same quality equipment</p>
            </div>
            <div className="bg-white/10 rounded-xl p-6 text-center">
              <FileText className="h-10 w-10 text-yellow-200 mx-auto mb-4" />
              <h3 className="font-semibold text-white">Free Training</h3>
              <p className="text-sm text-yellow-100 mt-2">On-site training and application support included</p>
            </div>
            <div className="bg-white/10 rounded-xl p-6 text-center">
              <Clock className="h-10 w-10 text-yellow-200 mx-auto mb-4" />
              <h3 className="font-semibold text-white">Local Support</h3>
              <p className="text-sm text-yellow-100 mt-2">Malaysian-based technical support and spare parts</p>
            </div>
            <div className="bg-white/10 rounded-xl p-6 text-center">
              <Shield className="h-10 w-10 text-yellow-200 mx-auto mb-4" />
              <h3 className="font-semibold text-white">Warranty</h3>
              <p className="text-sm text-yellow-100 mt-2">Comprehensive warranty with service agreements</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-100 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqData.map((faq, i) => (
              <details key={i} className="bg-white rounded-lg shadow-sm">
                <summary className="p-4 cursor-pointer font-medium text-gray-900 hover:text-yellow-600">{faq.question}</summary>
                <div className="px-4 pb-4 text-gray-600 text-sm">{faq.answer}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Related */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">Related Products</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link href="/medical-devices/patient-monitors" className="bg-white rounded-xl p-6 shadow-sm border hover:shadow-lg">
            <Activity className="h-10 w-10 text-green-500 mb-4" />
            <h3 className="font-semibold text-gray-900">Patient Monitors</h3>
            <span className="text-green-600 text-sm font-medium mt-4 inline-block">From RM 45 →</span>
          </Link>
          <Link href="/medical-devices/hospital-beds" className="bg-white rounded-xl p-6 shadow-sm border hover:shadow-lg">
            <Shield className="h-10 w-10 text-blue-500 mb-4" />
            <h3 className="font-semibold text-gray-900">Hospital Beds</h3>
            <span className="text-blue-600 text-sm font-medium mt-4 inline-block">From RM 800 →</span>
          </Link>
          <a href="https://oxygenconcentrator.my" className="bg-white rounded-xl p-6 shadow-sm border hover:shadow-lg">
            <Activity className="h-10 w-10 text-teal-500 mb-4" />
            <h3 className="font-semibold text-gray-900">Oxygen Concentrators</h3>
            <span className="text-teal-600 text-sm font-medium mt-4 inline-block">From RM 2,800 →</span>
          </a>
          <a href="https://evin2u.com" className="bg-white rounded-xl p-6 shadow-sm border hover:shadow-lg">
            <Shield className="h-10 w-10 text-purple-500 mb-4" />
            <h3 className="font-semibold text-gray-900">Medical Supplies</h3>
            <span className="text-purple-600 text-sm font-medium mt-4 inline-block">Shop Now →</span>
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-green-600 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Need Lab Equipment?</h2>
          <p className="mt-4 text-green-100">WhatsApp us for competitive quotes and product demonstrations.</p>
          <a href="https://wa.me/60123456789?text=Hi,%20I%20need%20laboratory%20equipment" className="mt-8 inline-flex items-center bg-white text-green-600 px-8 py-4 rounded-lg font-semibold hover:bg-green-50">
            <MessageSquare className="mr-2 h-5 w-5" />WhatsApp: +60 12-345 6789
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2">
              <h3 className="text-white font-bold text-lg mb-4">AA Alive Sdn Bhd</h3>
              <p className="text-gray-400 text-sm">Medical & laboratory equipment supplier in Malaysia. Urine analysers, patient monitors, and healthcare solutions.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Products</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/medical-devices/urine-analyser" className="hover:text-white">Urine Analysers</Link></li>
                <li><Link href="/medical-devices/patient-monitors" className="hover:text-white">Patient Monitors</Link></li>
                <li><Link href="/medical-devices/hospital-beds" className="hover:text-white">Hospital Beds</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Our Websites</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="https://evin.my" className="hover:text-white">Evin.my</a></li>
                <li><a href="https://katil-hospital.my" className="hover:text-white">Katil-Hospital.my</a></li>
                <li><Link href="/" className="hover:text-white">ChatUncle.my</Link></li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
