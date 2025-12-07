import { Metadata } from 'next';
import Link from 'next/link';
import {
  MessageSquare,
  Activity,
  Heart,
  Check,
  Star,
  Phone,
  Shield,
  Award,
  ArrowRight,
  Monitor,
  Thermometer,
  Droplets,
  Waves,
  Zap,
  AlertCircle,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Patient Monitors Malaysia | Vital Sign Monitor | SpO2 | ECG | Blood Pressure | AA Alive',
  description: 'Buy patient monitors & vital sign monitors in Malaysia. SpO2 pulse oximeter, ECG monitor, blood pressure monitor, temperature monitor. Hospital & home use. Better than Rapha Medical prices.',
  keywords: [
    'patient monitor malaysia',
    'vital sign monitor',
    'vital signs monitor malaysia',
    'SpO2 monitor',
    'pulse oximeter malaysia',
    'ECG monitor malaysia',
    'blood pressure monitor',
    'multiparameter monitor',
    'bedside monitor',
    'portable patient monitor',
    'hospital monitor',
    'ICU monitor malaysia',
    'cardiac monitor',
    'rapha medical alternative',
    'medi-life patient monitor',
    'medical monitoring equipment',
    'harga patient monitor',
    'beli vital sign monitor',
    'monitor pesakit',
    'home health monitor',
  ],
  alternates: {
    canonical: 'https://chatuncle.my/medical-devices/patient-monitors',
  },
  openGraph: {
    title: 'Patient Monitors Malaysia | Vital Sign Monitors | AA Alive',
    description: 'Vital sign monitors for hospitals and home use. SpO2, ECG, BP, temperature monitoring. Competitive prices.',
  },
};

const monitors = [
  {
    name: 'Fingertip Pulse Oximeter',
    sku: 'PM-FPO-001',
    description: 'Compact fingertip pulse oximeter for SpO2 and heart rate monitoring. Perfect for home use and spot checks.',
    parameters: ['SpO2', 'Pulse Rate'],
    display: 'LED Display',
    battery: '2x AAA batteries',
    price: 45,
    originalPrice: 80,
    features: ['Portable design', 'Auto power-off', '10-second reading', 'Lanyard included'],
    bestFor: ['Home monitoring', 'COPD patients', 'Post-COVID recovery'],
    popular: true,
  },
  {
    name: 'Handheld Pulse Oximeter',
    sku: 'PM-HPO-001',
    description: 'Professional handheld pulse oximeter with waveform display. Suitable for clinical use and spot checks.',
    parameters: ['SpO2', 'Pulse Rate', 'PI%'],
    display: 'Color LCD with waveform',
    battery: 'Rechargeable lithium',
    price: 450,
    originalPrice: 680,
    features: ['Waveform display', 'Adult & pediatric probes', 'Alarm function', 'Data storage'],
    bestFor: ['Clinics', 'Home visits', 'Emergency response'],
    popular: false,
  },
  {
    name: '3-Parameter Patient Monitor',
    sku: 'PM-3P-001',
    description: 'Basic patient monitor with SpO2, NIBP, and pulse rate. Ideal for general wards and home care.',
    parameters: ['SpO2', 'NIBP', 'Pulse Rate'],
    display: '8" Color TFT',
    battery: 'Built-in rechargeable',
    price: 1800,
    originalPrice: 2500,
    features: ['Compact design', 'Visual & audio alarms', 'Trend display', 'Adult/child modes'],
    bestFor: ['General wards', 'Recovery rooms', 'Home care'],
    popular: false,
  },
  {
    name: '5-Parameter Patient Monitor',
    sku: 'PM-5P-001',
    description: 'Mid-range patient monitor with ECG, SpO2, NIBP, temperature, and respiration. Hospital-grade quality.',
    parameters: ['ECG', 'SpO2', 'NIBP', 'Temp', 'Resp'],
    display: '12" Color TFT',
    battery: 'Built-in rechargeable',
    price: 3500,
    originalPrice: 5000,
    features: ['5-lead ECG', 'ST analysis', '72-hour trend', 'HL7 compatible'],
    bestFor: ['ICU', 'Operating rooms', 'Emergency departments'],
    popular: true,
  },
  {
    name: '7-Parameter Patient Monitor',
    sku: 'PM-7P-001',
    description: 'Advanced multiparameter monitor with CO2 and IBP capabilities. For critical care environments.',
    parameters: ['ECG', 'SpO2', 'NIBP', 'Temp', 'Resp', 'CO2', 'IBP'],
    display: '15" Touch Screen',
    battery: 'Built-in rechargeable',
    price: 8500,
    originalPrice: 12000,
    features: ['EtCO2 monitoring', 'Invasive BP', '12-lead ECG option', 'Central station ready'],
    bestFor: ['ICU', 'Anesthesia', 'Critical care'],
    popular: false,
  },
  {
    name: 'Portable Vital Signs Monitor',
    sku: 'PM-PVS-001',
    description: 'Lightweight portable monitor for ambulance and home visits. All-in-one vital signs measurement.',
    parameters: ['SpO2', 'NIBP', 'Temp', 'Pulse'],
    display: '7" Color LCD',
    battery: '8+ hours battery life',
    price: 2200,
    originalPrice: 3200,
    features: ['Lightweight 1.5kg', 'Drop tested', 'Spot check mode', 'EMR integration'],
    bestFor: ['Ambulance', 'Home healthcare', 'Sports medicine'],
    popular: false,
  },
];

const vitalSignsInfo = [
  {
    icon: Heart,
    name: 'SpO2 (Oxygen Saturation)',
    normal: '95-100%',
    description: 'Measures oxygen levels in blood. Critical for respiratory monitoring.',
    color: 'text-red-500',
  },
  {
    icon: Activity,
    name: 'ECG (Electrocardiogram)',
    normal: '60-100 bpm',
    description: 'Records heart electrical activity. Detects arrhythmias and cardiac issues.',
    color: 'text-green-500',
  },
  {
    icon: Waves,
    name: 'NIBP (Blood Pressure)',
    normal: '120/80 mmHg',
    description: 'Non-invasive blood pressure. Essential for cardiovascular monitoring.',
    color: 'text-blue-500',
  },
  {
    icon: Thermometer,
    name: 'Temperature',
    normal: '36.5-37.5°C',
    description: 'Body temperature monitoring. Indicates infection or metabolic issues.',
    color: 'text-orange-500',
  },
  {
    icon: Droplets,
    name: 'Respiration Rate',
    normal: '12-20 breaths/min',
    description: 'Breathing rate monitoring. Important for respiratory assessment.',
    color: 'text-purple-500',
  },
  {
    icon: Zap,
    name: 'EtCO2 (End-tidal CO2)',
    normal: '35-45 mmHg',
    description: 'Carbon dioxide levels in exhaled breath. Critical in anesthesia and ventilation.',
    color: 'text-teal-500',
  },
];

const faqData = [
  {
    question: 'What parameters does a basic patient monitor measure?',
    answer: 'A basic patient monitor typically measures SpO2 (oxygen saturation), NIBP (blood pressure), and pulse rate. More advanced monitors add ECG, temperature, respiration rate, and even CO2 and invasive blood pressure.',
  },
  {
    question: 'Can I use a patient monitor at home?',
    answer: 'Yes, many patient monitors are suitable for home use. Fingertip pulse oximeters are the most common home devices. For patients requiring more monitoring, portable 3-parameter monitors are available with easy-to-understand displays.',
  },
  {
    question: 'How accurate are pulse oximeters?',
    answer: 'Quality pulse oximeters have accuracy of ±2% for SpO2 readings between 70-100%. Factors affecting accuracy include nail polish, cold fingers, and excessive movement. Medical-grade devices are more accurate than consumer models.',
  },
  {
    question: 'Do you provide training for patient monitors?',
    answer: 'Yes, we provide free training for all patient monitors purchased. For hospitals and clinics, we offer on-site training sessions. Home users receive instructional videos and phone support.',
  },
];

const productSchema = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Patient Monitors Malaysia - Vital Sign Monitors',
  description: 'Patient monitors and vital sign monitoring equipment for hospitals and home use in Malaysia.',
  brand: { '@type': 'Brand', name: 'AA Alive Medical' },
  category: 'Medical Monitoring Equipment',
  offers: {
    '@type': 'AggregateOffer',
    lowPrice: '45',
    highPrice: '12000',
    priceCurrency: 'MYR',
    availability: 'https://schema.org/InStock',
  },
  aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8', reviewCount: '189' },
};

export default function PatientMonitorsPage() {
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
              <a href="https://wa.me/60123456789?text=Hi,%20I%20want%20to%20enquire%20about%20patient%20monitors" className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium text-sm">
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
          <span className="text-gray-900">Patient Monitors</span>
        </nav>
      </div>

      {/* Hero */}
      <header className="bg-gradient-to-r from-green-900 to-green-700 py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:flex lg:items-center lg:gap-12">
            <div className="lg:w-2/3">
              <div className="flex items-center space-x-2 mb-4">
                <Award className="h-5 w-5 text-yellow-400" />
                <span className="text-yellow-400 text-sm font-semibold">Hospital-Grade Equipment</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
                Patient Monitors &amp; Vital Sign Monitors
                <span className="block text-green-200 mt-2">Malaysia</span>
              </h1>
              <p className="mt-4 text-lg text-green-100 max-w-2xl">
                Professional <strong>patient monitors</strong> and <strong>vital sign monitors</strong> for hospitals, clinics, and home care.
                SpO2 pulse oximeters, ECG monitors, multiparameter monitors. Competitive prices vs Rapha Medical.
              </p>
              <div className="mt-6 flex flex-wrap gap-4">
                <div className="flex items-center text-white"><Check className="h-5 w-5 text-yellow-400 mr-2" /><span>SpO2 from RM 45</span></div>
                <div className="flex items-center text-white"><Check className="h-5 w-5 text-yellow-400 mr-2" /><span>Hospital Grade</span></div>
                <div className="flex items-center text-white"><Check className="h-5 w-5 text-yellow-400 mr-2" /><span>Free Training</span></div>
              </div>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <a href="https://wa.me/60123456789?text=Hi,%20I%20want%20to%20enquire%20about%20patient%20monitors" className="inline-flex items-center justify-center bg-white text-green-900 px-6 py-3 rounded-lg font-semibold hover:bg-green-50">
                  <Phone className="mr-2 h-5 w-5" />WhatsApp Enquiry
                </a>
                <a href="#products" className="inline-flex items-center justify-center border-2 border-white text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10">
                  View Products<ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </div>
            </div>
            <div className="hidden lg:block lg:w-1/3">
              <div className="bg-white/10 rounded-2xl p-6 text-center">
                <Monitor className="h-16 w-16 text-white mx-auto mb-4" />
                <div className="text-4xl font-bold text-white">RM 45</div>
                <div className="text-green-200">Starting Price</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Vital Signs Info */}
      <section className="bg-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Understanding Vital Signs</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {vitalSignsInfo.map((vital, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-6">
                <vital.icon className={`h-8 w-8 ${vital.color} mb-3`} />
                <h3 className="font-semibold text-gray-900">{vital.name}</h3>
                <p className="text-sm text-green-600 font-medium mt-1">Normal: {vital.normal}</p>
                <p className="text-sm text-gray-600 mt-2">{vital.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products */}
      <section id="products" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Patient Monitor Products</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {monitors.map((monitor) => (
            <article key={monitor.sku} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="bg-gradient-to-r from-green-600 to-green-500 p-4">
                <div className="flex justify-between items-start">
                  <span className="text-xs text-green-200">{monitor.sku}</span>
                  {monitor.popular && <span className="text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded">Popular</span>}
                </div>
                <h3 className="text-lg font-bold text-white mt-2">{monitor.name}</h3>
              </div>
              <div className="p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-2xl font-bold text-green-600">RM {monitor.price.toLocaleString()}</span>
                  <span className="text-sm text-gray-400 line-through">RM {monitor.originalPrice.toLocaleString()}</span>
                </div>
                <p className="text-gray-600 text-sm mb-3">{monitor.description}</p>
                <div className="mb-3">
                  <span className="text-xs text-gray-500">Parameters: </span>
                  <span className="text-xs font-medium">{monitor.parameters.join(' • ')}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                  <div><span className="text-gray-500">Display:</span> <span className="font-medium">{monitor.display}</span></div>
                  <div><span className="text-gray-500">Power:</span> <span className="font-medium">{monitor.battery}</span></div>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {monitor.features.slice(0, 3).map((f, i) => (
                    <span key={i} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">{f}</span>
                  ))}
                </div>
                <a href={`https://wa.me/60123456789?text=Hi,%20I%20want%20to%20enquire%20about%20${encodeURIComponent(monitor.name)}`} className="w-full inline-flex items-center justify-center bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 font-medium text-sm">
                  <MessageSquare className="mr-2 h-4 w-4" />Get Quote
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-100 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqData.map((faq, i) => (
              <details key={i} className="bg-white rounded-lg shadow-sm">
                <summary className="p-4 cursor-pointer font-medium text-gray-900 hover:text-green-600">{faq.question}</summary>
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
          <Link href="/medical-devices/hospital-beds" className="bg-white rounded-xl p-6 shadow-sm border hover:shadow-lg transition-shadow">
            <Shield className="h-10 w-10 text-blue-500 mb-4" />
            <h3 className="font-semibold text-gray-900">Hospital Beds</h3>
            <span className="text-blue-600 text-sm font-medium mt-4 inline-block">From RM 800 →</span>
          </Link>
          <a href="https://oxygenconcentrator.my" className="bg-white rounded-xl p-6 shadow-sm border hover:shadow-lg transition-shadow">
            <Activity className="h-10 w-10 text-teal-500 mb-4" />
            <h3 className="font-semibold text-gray-900">Oxygen Concentrators</h3>
            <span className="text-teal-600 text-sm font-medium mt-4 inline-block">From RM 2,800 →</span>
          </a>
          <Link href="/medical-devices/anti-embolism-stockings" className="bg-white rounded-xl p-6 shadow-sm border hover:shadow-lg transition-shadow">
            <Heart className="h-10 w-10 text-red-500 mb-4" />
            <h3 className="font-semibold text-gray-900">Anti-Embolism Stockings</h3>
            <span className="text-red-600 text-sm font-medium mt-4 inline-block">From RM 45 →</span>
          </Link>
          <a href="https://evin2u.com" className="bg-white rounded-xl p-6 shadow-sm border hover:shadow-lg transition-shadow">
            <Shield className="h-10 w-10 text-purple-500 mb-4" />
            <h3 className="font-semibold text-gray-900">Patient Care Supplies</h3>
            <span className="text-purple-600 text-sm font-medium mt-4 inline-block">Shop Now →</span>
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-green-600 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Need Patient Monitoring Equipment?</h2>
          <p className="mt-4 text-green-100">WhatsApp us for product recommendations and competitive quotes.</p>
          <a href="https://wa.me/60123456789?text=Hi,%20I%20need%20patient%20monitoring%20equipment" className="mt-8 inline-flex items-center bg-white text-green-600 px-8 py-4 rounded-lg font-semibold hover:bg-green-50">
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
              <p className="text-gray-400 text-sm">Malaysia&apos;s trusted medical equipment supplier. Patient monitors, hospital beds, and healthcare solutions.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Products</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/medical-devices/patient-monitors" className="hover:text-white">Patient Monitors</Link></li>
                <li><Link href="/medical-devices/hospital-beds" className="hover:text-white">Hospital Beds</Link></li>
                <li><a href="https://oxygenconcentrator.my" className="hover:text-white">Oxygen Concentrators</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Our Websites</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="https://katil-hospital.my" className="hover:text-white">Katil-Hospital.my</a></li>
                <li><a href="https://evin.my" className="hover:text-white">Evin.my</a></li>
                <li><Link href="/" className="hover:text-white">ChatUncle.my</Link></li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
