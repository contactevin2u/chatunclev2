import { Metadata } from 'next';
import Link from 'next/link';
import {
  MessageSquare,
  Bed,
  Check,
  Star,
  Phone,
  Shield,
  Award,
  ArrowRight,
  Truck,
  Settings,
  Users,
  Clock,
  Home,
  Building2,
  Wrench,
  CreditCard,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Hospital Beds Malaysia | Katil Hospital | Electric & Manual | Rental & Sale | AA Alive',
  description: 'Buy or rent hospital beds in Malaysia. Electric & manual katil hospital for home care & medical facilities. Free delivery KL/Selangor. Better prices than Rapha Medical & Medi-life. Superbrands 2025.',
  keywords: [
    'hospital bed malaysia',
    'katil hospital',
    'hospital bed rental malaysia',
    'sewa katil hospital',
    'electric hospital bed',
    'manual hospital bed',
    'home care bed malaysia',
    'medical bed supplier',
    'hospital bed price malaysia',
    'harga katil hospital',
    'ICU bed malaysia',
    'patient bed',
    'adjustable hospital bed',
    'hospital furniture malaysia',
    'rapha medical alternative',
    'medi-life alternative',
    'hospital equipment supplier',
    'katil pesakit',
    'beli katil hospital',
    'hospital bed KL',
    'hospital bed Selangor',
    'AA Alive hospital beds',
  ],
  alternates: {
    canonical: 'https://chatuncle.my/medical-devices/hospital-beds',
  },
  openGraph: {
    title: 'Hospital Beds Malaysia | Katil Hospital | Rental & Sale | AA Alive',
    description: 'Buy or rent hospital beds in Malaysia. Electric & manual beds for home care. Free delivery KL/Selangor. Superbrands 2025 winner.',
    url: 'https://chatuncle.my/medical-devices/hospital-beds',
    type: 'website',
  },
};

const bedTypes = [
  {
    name: 'Manual Hospital Bed - 2 Crank',
    sku: 'HB-M2C-001',
    description: 'Basic 2-crank manual hospital bed with adjustable head and foot sections. Ideal for home care and budget-conscious facilities.',
    type: 'Manual',
    functions: '2 Functions (Head & Foot)',
    mattress: 'Foam mattress included',
    sideRails: 'Foldable side rails',
    price: 1500,
    rentalPrice: 200,
    originalPrice: 2200,
    features: ['Epoxy-coated steel frame', 'Easy-clean surface', 'Castor wheels with brakes', '150kg weight capacity'],
    bestFor: ['Home care', 'Budget facilities', 'Short-term recovery'],
  },
  {
    name: 'Manual Hospital Bed - 3 Crank',
    sku: 'HB-M3C-001',
    description: '3-crank manual hospital bed with height adjustment. More versatile for caregiving and patient transfers.',
    type: 'Manual',
    functions: '3 Functions (Head, Foot, Height)',
    mattress: 'Medical foam mattress included',
    sideRails: 'Aluminum side rails',
    price: 2200,
    rentalPrice: 280,
    originalPrice: 3000,
    features: ['Height adjustable', 'Trendelenburg position', 'Heavy-duty castors', '180kg weight capacity'],
    bestFor: ['Long-term home care', 'Nursing homes', 'Clinics'],
  },
  {
    name: 'Electric Hospital Bed - 3 Function',
    sku: 'HB-E3F-001',
    description: 'Electric hospital bed with remote control for easy adjustment. Perfect for elderly patients and caregivers.',
    type: 'Electric',
    functions: '3 Functions (Head, Foot, Height)',
    mattress: 'Premium foam mattress included',
    sideRails: 'ABS plastic side rails',
    price: 4500,
    rentalPrice: 450,
    originalPrice: 6500,
    features: ['Wireless remote control', 'Battery backup', 'Quiet motor', 'Emergency lowering'],
    bestFor: ['Elderly care', 'Post-surgery recovery', 'Mobility-impaired patients'],
  },
  {
    name: 'Electric Hospital Bed - 5 Function',
    sku: 'HB-E5F-001',
    description: 'Full-featured electric hospital bed with CPR function and Trendelenburg. Hospital-grade quality for home use.',
    type: 'Electric',
    functions: '5 Functions + CPR',
    mattress: 'Anti-decubitus mattress included',
    sideRails: 'Collapsible ABS rails',
    price: 7500,
    rentalPrice: 650,
    originalPrice: 10000,
    features: ['CPR release', 'Trendelenburg & Reverse', 'Central locking', 'IV pole included'],
    bestFor: ['ICU-level home care', 'High-dependency patients', 'Hospitals & clinics'],
  },
  {
    name: 'ICU Electric Bed - Premium',
    sku: 'HB-ICU-001',
    description: 'Premium ICU-grade electric bed with weighing scale, CPR, and advanced positioning. For critical care at home.',
    type: 'Electric ICU',
    functions: '7+ Functions',
    mattress: 'Alternating pressure mattress',
    sideRails: 'Split aluminum rails',
    price: 15000,
    rentalPrice: 1200,
    originalPrice: 22000,
    features: ['Built-in weighing scale', 'Column structure', 'X-ray translucent', 'Nurse control panel'],
    bestFor: ['ICU patients', 'Ventilator patients', 'Critical home care'],
  },
  {
    name: 'Fowler Bed - Economy',
    sku: 'HB-FW-001',
    description: 'Semi-Fowler manual bed for basic patient positioning. Most affordable option for temporary use.',
    type: 'Manual',
    functions: '1 Function (Head only)',
    mattress: 'Basic foam mattress',
    sideRails: 'Optional',
    price: 800,
    rentalPrice: 120,
    originalPrice: 1200,
    features: ['Compact design', 'Lightweight', 'Easy assembly', 'Basic positioning'],
    bestFor: ['Short-term use', 'Budget option', 'Simple recovery'],
  },
];

const services = [
  {
    icon: Truck,
    title: 'Free Delivery & Setup',
    description: 'Free delivery and professional setup within Klang Valley. Nationwide delivery available.',
  },
  {
    icon: CreditCard,
    title: 'Rental Options',
    description: 'Flexible rental plans starting from RM 120/month. No long-term commitment required.',
  },
  {
    icon: Wrench,
    title: 'Maintenance & Repair',
    description: 'Regular maintenance service and quick repair response. Parts always in stock.',
  },
  {
    icon: Clock,
    title: '24/7 Support',
    description: 'Round-the-clock WhatsApp support for emergencies and inquiries.',
  },
];

const comparisons = [
  { feature: 'Price Range', aaAlive: 'RM 800 - RM 15,000', others: 'RM 1,500 - RM 25,000' },
  { feature: 'Free Delivery KL', aaAlive: '✓ Yes', others: 'RM 100-300 charge' },
  { feature: 'Free Setup', aaAlive: '✓ Included', others: 'Extra charge' },
  { feature: 'Rental Available', aaAlive: '✓ From RM 120/mo', others: 'Limited options' },
  { feature: 'Mattress Included', aaAlive: '✓ Yes', others: 'Often separate' },
  { feature: 'WhatsApp Support', aaAlive: '✓ 24/7', others: 'Office hours only' },
  { feature: 'Same-Day Delivery', aaAlive: '✓ KL/Selangor', others: 'Rarely available' },
];

const faqData = [
  {
    question: 'Should I buy or rent a hospital bed?',
    answer: 'Rent if you need the bed for less than 6 months or are unsure of long-term needs. Buy if the patient requires long-term care (6+ months) - it becomes more economical. We offer rent-to-own options where rental payments can be converted to purchase.',
  },
  {
    question: 'What is the difference between electric and manual hospital beds?',
    answer: 'Electric beds use motors controlled by remote for easy adjustment - ideal for elderly caregivers or patients who need to adjust position independently. Manual beds use hand cranks - more affordable but require physical effort to adjust.',
  },
  {
    question: 'Do hospital beds come with mattress?',
    answer: 'Yes, all our hospital beds include a suitable mattress at no extra cost. Basic beds come with foam mattresses, while premium beds include medical-grade or anti-decubitus (pressure relief) mattresses.',
  },
  {
    question: 'How wide is a standard hospital bed?',
    answer: 'Standard single hospital beds are 90cm wide x 200cm long. We also offer wider options (100cm, 120cm) for larger patients or those who need extra room.',
  },
  {
    question: 'Can hospital beds fit through standard doorways?',
    answer: 'Yes, all our hospital beds are designed to fit through standard Malaysian doorways (minimum 70cm). Our delivery team will assess your space before delivery and can disassemble/reassemble if needed.',
  },
  {
    question: 'Do you deliver to East Malaysia?',
    answer: 'Yes, we deliver to Sabah and Sarawak. Shipping charges apply based on location and bed type. Contact us for a quote. West Malaysia peninsula enjoys lower shipping rates.',
  },
];

const productSchema = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Hospital Beds Malaysia - Katil Hospital',
  description: 'Hospital beds for home care and medical facilities in Malaysia. Electric and manual options. Rental and purchase available.',
  brand: { '@type': 'Brand', name: 'AA Alive Medical' },
  category: 'Hospital Beds',
  offers: {
    '@type': 'AggregateOffer',
    lowPrice: '800',
    highPrice: '15000',
    priceCurrency: 'MYR',
    availability: 'https://schema.org/InStock',
    offerCount: bedTypes.length,
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.9',
    reviewCount: '523',
  },
};

const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'AA Alive - Hospital Bed Supplier Malaysia',
  description: 'Hospital bed supplier in Malaysia offering sales, rental, and maintenance services.',
  url: 'https://katil-hospital.my',
  telephone: '+60123456789',
  priceRange: 'RM 800 - RM 15,000',
  address: {
    '@type': 'PostalAddress',
    addressCountry: 'MY',
    addressRegion: 'Selangor',
  },
  areaServed: ['Kuala Lumpur', 'Selangor', 'Malaysia'],
  openingHours: 'Mo-Sa 09:00-18:00',
  sameAs: ['https://katil-hospital.my'],
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqData.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: { '@type': 'Answer', text: faq.answer },
  })),
};

export default function HospitalBedsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

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
                href="https://katil-hospital.my"
                target="_blank"
                rel="noopener"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                Visit Katil-Hospital.my
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
          <span className="text-gray-900">Hospital Beds</span>
        </nav>
      </div>

      {/* Hero */}
      <header className="bg-gradient-to-r from-blue-900 to-blue-700 py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:flex lg:items-center lg:gap-12">
            <div className="lg:w-2/3">
              <div className="flex items-center space-x-2 mb-4">
                <Award className="h-5 w-5 text-yellow-400" />
                <span className="text-yellow-400 text-sm font-semibold">Superbrands Malaysia 2025</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
                Hospital Beds Malaysia
                <span className="block text-blue-200 mt-2">Katil Hospital - Rental &amp; Sale</span>
              </h1>
              <p className="mt-4 text-lg text-blue-100 max-w-2xl">
                Malaysia&apos;s trusted <strong>hospital bed supplier</strong>. Electric &amp; manual <strong>katil hospital</strong> for
                home care and medical facilities. Better prices than Rapha Medical &amp; Medi-life with free delivery in KL/Selangor.
              </p>
              <div className="mt-6 flex flex-wrap gap-4">
                <div className="flex items-center text-white">
                  <Check className="h-5 w-5 text-green-400 mr-2" />
                  <span>Free Delivery KL/Selangor</span>
                </div>
                <div className="flex items-center text-white">
                  <Check className="h-5 w-5 text-green-400 mr-2" />
                  <span>Rental from RM 120/mo</span>
                </div>
                <div className="flex items-center text-white">
                  <Check className="h-5 w-5 text-green-400 mr-2" />
                  <span>Mattress Included</span>
                </div>
              </div>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <a
                  href="https://wa.me/60123456789?text=Hi,%20I%20want%20to%20enquire%20about%20hospital%20beds"
                  className="inline-flex items-center justify-center bg-white text-blue-900 px-6 py-3 rounded-lg font-semibold hover:bg-blue-50"
                >
                  <Phone className="mr-2 h-5 w-5" />
                  WhatsApp Enquiry
                </a>
                <a
                  href="https://katil-hospital.my"
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center justify-center border-2 border-white text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10"
                >
                  Visit Katil-Hospital.my
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </div>
            </div>
            <div className="hidden lg:block lg:w-1/3">
              <div className="bg-white/10 rounded-2xl p-6 text-center">
                <Bed className="h-16 w-16 text-white mx-auto mb-4" />
                <div className="text-4xl font-bold text-white">RM 800</div>
                <div className="text-blue-200">Starting Price</div>
                <div className="text-sm text-blue-200 mt-2">Rental from RM 120/mo</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Trust Stats */}
      <section className="bg-white py-6 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div><span className="text-2xl font-bold text-blue-600">5,000+</span><p className="text-sm text-gray-600">Beds Delivered</p></div>
            <div><span className="text-2xl font-bold text-blue-600">500+</span><p className="text-sm text-gray-600">Hospital Clients</p></div>
            <div><span className="text-2xl font-bold text-blue-600">15+</span><p className="text-sm text-gray-600">Years Experience</p></div>
            <div><span className="text-2xl font-bold text-blue-600">4.9/5</span><p className="text-sm text-gray-600">Customer Rating</p></div>
          </div>
        </div>
      </section>

      {/* Bed Types */}
      <section id="products" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-4">Hospital Bed Types &amp; Prices</h2>
        <p className="text-gray-600 text-center max-w-2xl mx-auto mb-8">
          Choose from manual or electric hospital beds. All beds include mattress, side rails, and free delivery within Klang Valley.
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bedTypes.map((bed) => (
            <article key={bed.sku} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow">
              <div className={`p-4 ${bed.type === 'Electric' || bed.type === 'Electric ICU' ? 'bg-gradient-to-r from-blue-600 to-blue-500' : 'bg-gradient-to-r from-gray-600 to-gray-500'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs text-white/70">{bed.sku}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded ${bed.type.includes('Electric') ? 'bg-yellow-400 text-yellow-900' : 'bg-gray-300 text-gray-800'}`}>
                      {bed.type}
                    </span>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white mt-2">{bed.name}</h3>
              </div>
              <div className="p-4">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <span className="text-2xl font-bold text-blue-600">RM {bed.price.toLocaleString()}</span>
                    <span className="text-sm text-gray-400 line-through ml-2">RM {bed.originalPrice.toLocaleString()}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm text-green-600 font-medium">Rent: RM {bed.rentalPrice}/mo</span>
                  </div>
                </div>
                <p className="text-gray-600 text-sm mb-3">{bed.description}</p>
                <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                  <div><span className="text-gray-500">Functions:</span> <span className="font-medium">{bed.functions}</span></div>
                  <div><span className="text-gray-500">Side Rails:</span> <span className="font-medium">{bed.sideRails}</span></div>
                </div>
                <div className="text-xs text-green-600 mb-3">✓ {bed.mattress}</div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {bed.features.map((f, i) => (
                    <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{f}</span>
                  ))}
                </div>
                <a
                  href={`https://wa.me/60123456789?text=Hi,%20I%20want%20to%20enquire%20about%20${encodeURIComponent(bed.name)}%20(${bed.sku})`}
                  className="w-full inline-flex items-center justify-center bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium text-sm"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Get Quote
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Buy vs Rent */}
      <section className="bg-blue-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Buy or Rent? We Have Both Options</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center mb-4">
                <Home className="h-8 w-8 text-blue-600 mr-3" />
                <h3 className="text-xl font-bold text-gray-900">Buy - Best for Long-Term</h3>
              </div>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-start"><Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />One-time payment, yours forever</li>
                <li className="flex items-start"><Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />More economical for 6+ months use</li>
                <li className="flex items-start"><Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />Full warranty coverage</li>
                <li className="flex items-start"><Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />Resale value if no longer needed</li>
              </ul>
              <p className="mt-4 text-blue-600 font-semibold">Starting from RM 800</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center mb-4">
                <Clock className="h-8 w-8 text-green-600 mr-3" />
                <h3 className="text-xl font-bold text-gray-900">Rent - Best for Short-Term</h3>
              </div>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-start"><Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />Low monthly payments</li>
                <li className="flex items-start"><Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />No commitment - cancel anytime</li>
                <li className="flex items-start"><Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />Maintenance included</li>
                <li className="flex items-start"><Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />Rent-to-own option available</li>
              </ul>
              <p className="mt-4 text-green-600 font-semibold">Starting from RM 120/month</p>
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Why Choose AA Alive for Hospital Beds?</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map((service, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
              <service.icon className="h-10 w-10 text-blue-600 mx-auto mb-4" />
              <h3 className="font-semibold text-gray-900 mb-2">{service.title}</h3>
              <p className="text-sm text-gray-600">{service.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison Table */}
      <section className="bg-gray-100 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
            AA Alive vs Other Suppliers
          </h2>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-blue-600 text-white">
                <tr>
                  <th className="p-4 text-left">Feature</th>
                  <th className="p-4 text-center">AA Alive</th>
                  <th className="p-4 text-center">Others</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                    <td className="p-4 font-medium">{row.feature}</td>
                    <td className="p-4 text-center text-green-600 font-medium">{row.aaAlive}</td>
                    <td className="p-4 text-center text-gray-500">{row.others}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Who Needs a Hospital Bed?</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <Users className="h-8 w-8 text-blue-500 mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Elderly Care</h3>
            <p className="text-sm text-gray-600">Seniors with mobility issues who need adjustable positioning and easier transfers.</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <Building2 className="h-8 w-8 text-purple-500 mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Post-Surgery Recovery</h3>
            <p className="text-sm text-gray-600">Patients recovering from surgery who need proper positioning at home.</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <Shield className="h-8 w-8 text-green-500 mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Chronic Illness</h3>
            <p className="text-sm text-gray-600">Long-term care for patients with chronic conditions requiring bed rest.</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <Settings className="h-8 w-8 text-orange-500 mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Palliative Care</h3>
            <p className="text-sm text-gray-600">Comfort care for patients with serious illness focusing on quality of life.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqData.map((faq, i) => (
              <details key={i} className="bg-white rounded-lg shadow-sm border border-gray-100">
                <summary className="p-4 cursor-pointer font-medium text-gray-900 hover:text-blue-600">{faq.question}</summary>
                <div className="px-4 pb-4 text-gray-600 text-sm">{faq.answer}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-green-600 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Need a Hospital Bed?</h2>
          <p className="mt-4 text-green-100 text-lg">WhatsApp us for instant quotes, product advice, and same-day delivery in KL/Selangor.</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="https://wa.me/60123456789?text=Hi,%20I%20need%20a%20hospital%20bed" className="inline-flex items-center bg-white text-green-600 px-8 py-4 rounded-lg font-semibold hover:bg-green-50">
              <MessageSquare className="mr-2 h-5 w-5" />WhatsApp: +60 12-345 6789
            </a>
            <a href="https://katil-hospital.my" target="_blank" rel="noopener" className="inline-flex items-center border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white/10">
              Visit Katil-Hospital.my
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2">
              <h3 className="text-white font-bold text-lg mb-4">AA Alive Sdn Bhd</h3>
              <p className="text-gray-400 text-sm">Malaysia&apos;s trusted hospital bed supplier. Superbrands 2025 winner. Serving homes and hospitals nationwide since 2008.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Products</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/medical-devices/hospital-beds" className="hover:text-white">Hospital Beds</Link></li>
                <li><Link href="/medical-devices/anti-embolism-stockings" className="hover:text-white">Anti-Embolism Stockings</Link></li>
                <li><Link href="/medical-devices/compression-stockings" className="hover:text-white">Compression Stockings</Link></li>
                <li><a href="https://oxygenconcentrator.my" target="_blank" rel="noopener" className="hover:text-white">Oxygen Concentrators</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Our Websites</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="https://katil-hospital.my" target="_blank" rel="noopener" className="hover:text-white">Katil-Hospital.my</a></li>
                <li><a href="https://oxygenconcentrator.my" target="_blank" rel="noopener" className="hover:text-white">OxygenConcentrator.my</a></li>
                <li><a href="https://electric-wheelchair.my" target="_blank" rel="noopener" className="hover:text-white">Electric-Wheelchair.my</a></li>
                <li><a href="https://evin.my" target="_blank" rel="noopener" className="hover:text-white">Evin.my</a></li>
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
