import type { Metadata } from 'next';
import Link from 'next/link';
import { Phone, MessageCircle, Truck, Shield, Award, CheckCircle, Star, Moon, Wind, Volume2, Droplets, ChevronRight, AlertCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'CPAP Machine Malaysia | Sleep Apnea Treatment | AA Alive Sdn Bhd',
  description: 'Buy or rent CPAP machines in Malaysia. MMDR registered supplier. Auto CPAP, BiPAP, travel CPAP machines. ResMed, Philips alternatives. Free delivery KL & Selangor. Superbrands 2025.',
  keywords: [
    'CPAP machine malaysia',
    'CPAP machine price malaysia',
    'beli CPAP machine',
    'sewa CPAP machine',
    'sleep apnea treatment malaysia',
    'auto CPAP malaysia',
    'BiPAP machine malaysia',
    'travel CPAP malaysia',
    'CPAP mask malaysia',
    'CPAP supplies malaysia',
    'sleep apnea machine',
    'mesin CPAP malaysia',
    'CPAP rental malaysia',
    'CPAP for sale malaysia',
    'ResMed CPAP alternative',
    'Philips CPAP alternative',
    'CPAP therapy malaysia',
    'OSA treatment malaysia',
    'obstructive sleep apnea',
    'CPAP kuala lumpur',
    'CPAP selangor',
    'CPAP johor',
    'CPAP penang',
    'AA Alive CPAP',
    'Evin CPAP machine',
    'MMDR registered CPAP supplier',
    'snoring treatment malaysia',
    'sleep study malaysia',
  ],
  openGraph: {
    title: 'CPAP Machine Malaysia | Sleep Apnea Treatment',
    description: 'MMDR registered CPAP machine supplier. Buy or rent Auto CPAP, BiPAP, and travel CPAP. Free delivery KL & Selangor.',
    url: 'https://chatuncle.my/medical-devices/cpap-machines',
    siteName: 'AA Alive - ChatUncle',
    locale: 'en_MY',
    type: 'website',
  },
  alternates: {
    canonical: 'https://chatuncle.my/medical-devices/cpap-machines',
  },
};

const cpapMachines = [
  {
    name: 'Auto CPAP Machine',
    description: 'Automatically adjusts pressure throughout the night. Most popular choice for first-time users.',
    pressure: '4-20 cm H₂O',
    noise: '≤26 dB',
    weight: '1.2kg',
    features: ['Auto-adjusting pressure', 'Heated humidifier', 'Data tracking', 'Ramp function'],
    price: 'RM 2,800',
    rentalPrice: 'RM 250/month',
    includes: ['Machine', 'Humidifier', 'Nasal mask', 'Tubing', 'Carry bag'],
    bestFor: 'First-time users, mild to moderate OSA',
    popular: true,
  },
  {
    name: 'Fixed Pressure CPAP',
    description: 'Delivers constant pressure as prescribed by your doctor. Simple and reliable operation.',
    pressure: '4-20 cm H₂O (fixed)',
    noise: '≤28 dB',
    weight: '1.0kg',
    features: ['Set pressure delivery', 'Basic humidifier', 'EPR technology', 'Compact design'],
    price: 'RM 1,800',
    rentalPrice: 'RM 180/month',
    includes: ['Machine', 'Humidifier', 'Nasal mask', 'Tubing'],
    bestFor: 'Budget-conscious, stable pressure needs',
    popular: false,
  },
  {
    name: 'BiPAP Machine',
    description: 'Two pressure levels for inhale and exhale. Better comfort for complex sleep apnea.',
    pressure: 'IPAP: 4-25, EPAP: 4-20 cm H₂O',
    noise: '≤28 dB',
    weight: '1.5kg',
    features: ['Bi-level pressure', 'Backup rate', 'Advanced humidifier', 'Detailed reporting'],
    price: 'RM 5,500',
    rentalPrice: 'RM 450/month',
    includes: ['Machine', 'Humidifier', 'Full face mask', 'Tubing', 'SD card'],
    bestFor: 'Complex/central sleep apnea, high pressure needs',
    popular: false,
  },
  {
    name: 'Travel CPAP Machine',
    description: 'Ultra-compact and lightweight for travel. FAA approved with universal power.',
    pressure: '4-20 cm H₂O',
    noise: '≤30 dB',
    weight: '0.3kg',
    features: ['Palm-sized', 'Battery option', 'USB charging', 'Waterless humidification'],
    price: 'RM 3,500',
    rentalPrice: 'RM 300/month',
    includes: ['Machine', 'Travel mask', 'USB cable', 'Travel case'],
    bestFor: 'Frequent travelers, backup device',
    popular: true,
  },
  {
    name: 'CPAP with Integrated Humidifier',
    description: 'Built-in heated humidifier prevents dryness. Ideal for Malaysia\'s air-conditioned environments.',
    pressure: '4-20 cm H₂O',
    noise: '≤26 dB',
    weight: '2.0kg',
    features: ['Heated tube', 'Climate control', 'Large water chamber', 'Quiet operation'],
    price: 'RM 3,200',
    rentalPrice: 'RM 280/month',
    includes: ['Machine', 'Heated tube', 'Nasal mask', 'Extra filters'],
    bestFor: 'Dry mouth/nose, AC bedroom users',
    popular: false,
  },
  {
    name: 'Pediatric CPAP Machine',
    description: 'Designed for children with sleep apnea. Lower pressure range and child-friendly interface.',
    pressure: '4-15 cm H₂O',
    noise: '≤25 dB',
    weight: '1.0kg',
    features: ['Low pressure range', 'Gentle ramp', 'Child masks', 'Parent lock'],
    price: 'RM 3,800',
    rentalPrice: 'RM 350/month',
    includes: ['Machine', 'Pediatric mask set', 'Humidifier', 'Carry bag'],
    bestFor: 'Children with OSA, pediatric patients',
    popular: false,
  },
];

const masks = [
  {
    name: 'Nasal Mask',
    description: 'Covers nose only. Most popular choice.',
    price: 'RM 280-450',
    pros: ['Lightweight', 'Good seal', 'Less claustrophobic'],
  },
  {
    name: 'Nasal Pillows',
    description: 'Minimal contact, sits at nostrils.',
    price: 'RM 200-350',
    pros: ['Minimal contact', 'Good for glasses', 'Less marks'],
  },
  {
    name: 'Full Face Mask',
    description: 'Covers nose and mouth.',
    price: 'RM 380-550',
    pros: ['For mouth breathers', 'Higher pressure tolerance', 'Secure seal'],
  },
  {
    name: 'Hybrid Mask',
    description: 'Combines pillows with mouth cover.',
    price: 'RM 320-480',
    pros: ['Versatile', 'Minimal nose contact', 'Mouth coverage'],
  },
];

const sleepApneaSigns = [
  'Loud snoring',
  'Gasping during sleep',
  'Morning headaches',
  'Daytime sleepiness',
  'Difficulty concentrating',
  'Irritability or mood changes',
  'High blood pressure',
  'Waking up frequently at night',
];

const faqs = [
  {
    question: 'Do I need a prescription to buy a CPAP machine in Malaysia?',
    answer: 'While not legally required, we strongly recommend getting a sleep study (polysomnography) first. This determines if you have sleep apnea and what pressure settings you need. We can refer you to sleep specialists in KL.',
  },
  {
    question: 'How do I know what CPAP pressure I need?',
    answer: 'Your pressure setting should be determined by a sleep study or CPAP titration. Auto CPAP machines can self-adjust between 4-20 cm H₂O based on your breathing. Never set your own pressure without medical guidance.',
  },
  {
    question: 'How often should I replace CPAP supplies?',
    answer: 'Mask cushion: every 1-3 months. Full mask: every 6-12 months. Tubing: every 6-12 months. Filters: every 2-4 weeks. Humidifier chamber: every 6 months. Regular replacement ensures hygiene and effectiveness.',
  },
  {
    question: 'Why do I wake up with a dry mouth when using CPAP?',
    answer: 'Dry mouth usually means you\'re breathing through your mouth or your humidifier settings are too low. Solutions: increase humidity, use a heated tube, try a chin strap, or switch to a full face mask.',
  },
  {
    question: 'Can I travel with my CPAP machine?',
    answer: 'Yes! CPAP machines are considered medical devices and are allowed on flights. They don\'t count towards carry-on limits. Notify the airline, bring your prescription, and consider a travel CPAP for convenience.',
  },
  {
    question: 'How do I clean my CPAP machine?',
    answer: 'Daily: Wash mask with mild soap, empty humidifier. Weekly: Wash tubing and humidifier chamber. Monthly: Replace filters. Some users prefer CPAP cleaners (ozone/UV), though soap and water is equally effective.',
  },
  {
    question: 'What is the difference between CPAP and BiPAP?',
    answer: 'CPAP delivers one continuous pressure. BiPAP delivers two pressures - higher when you inhale, lower when you exhale. BiPAP is prescribed for complex sleep apnea, central apnea, or when high CPAP pressures cause discomfort.',
  },
  {
    question: 'How long does it take to get used to CPAP?',
    answer: 'Most people adjust within 2-4 weeks. Start by wearing the mask while awake, then during naps. Use the ramp function to start at low pressure. Consistency is key - use it every night for best results.',
  },
];

export default function CPAPMachinesPage() {
  const whatsappNumber = '60126181683';
  const whatsappMessage = encodeURIComponent('Hi, I\'m interested in CPAP machines for sleep apnea. Can you help me choose the right one?');

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-indigo-800 via-indigo-700 to-purple-700 text-white py-16">
        <div className="container mx-auto px-4">
          <nav className="text-sm mb-6 text-indigo-200">
            <Link href="/" className="hover:text-white">Home</Link>
            <ChevronRight className="inline w-4 h-4 mx-2" />
            <Link href="/medical-devices" className="hover:text-white">Medical Devices</Link>
            <ChevronRight className="inline w-4 h-4 mx-2" />
            <span className="text-white">CPAP Machines</span>
          </nav>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-indigo-900/50 px-4 py-2 rounded-full text-sm mb-4">
                <Award className="w-4 h-4 text-yellow-400" />
                <span>MMDR Registered | Superbrands 2025</span>
              </div>

              <h1 className="text-4xl md:text-5xl font-bold mb-4">
                CPAP Machine Malaysia
              </h1>
              <p className="text-xl text-indigo-100 mb-6">
                Buy or rent CPAP machines for sleep apnea treatment. Auto CPAP, BiPAP, and travel CPAP available.
                Free delivery & setup in KL & Selangor.
              </p>

              <div className="flex flex-wrap gap-4">
                <a
                  href={`https://wa.me/${whatsappNumber}?text=${whatsappMessage}`}
                  className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold transition"
                >
                  <MessageCircle className="w-5 h-5" />
                  WhatsApp Now
                </a>
                <a
                  href={`tel:+${whatsappNumber}`}
                  className="inline-flex items-center gap-2 bg-white text-indigo-700 px-6 py-3 rounded-lg font-semibold transition hover:bg-indigo-50"
                >
                  <Phone className="w-5 h-5" />
                  Call Us
                </a>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur rounded-2xl p-8">
              <h2 className="text-2xl font-bold mb-6">Why Choose AA Alive?</h2>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <Shield className="w-6 h-6 text-green-400 mt-1" />
                  <div>
                    <strong>MMDR Registered</strong>
                    <p className="text-indigo-200 text-sm">Official Medical Device Authority Malaysia registered</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Truck className="w-6 h-6 text-green-400 mt-1" />
                  <div>
                    <strong>Free Setup & Training</strong>
                    <p className="text-indigo-200 text-sm">In-home setup with mask fitting and usage training</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Moon className="w-6 h-6 text-green-400 mt-1" />
                  <div>
                    <strong>Sleep Specialist Referral</strong>
                    <p className="text-indigo-200 text-sm">We can connect you with sleep study clinics</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Star className="w-6 h-6 text-green-400 mt-1" />
                  <div>
                    <strong>Full Supplies Range</strong>
                    <p className="text-indigo-200 text-sm">Masks, tubing, filters, and all CPAP accessories</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Sleep Apnea Warning Signs */}
      <section className="py-8 bg-yellow-50 border-y border-yellow-200">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4 mb-4">
            <AlertCircle className="w-8 h-8 text-yellow-600" />
            <h2 className="text-xl font-bold text-yellow-800">Do You Have Sleep Apnea?</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {sleepApneaSigns.map((sign, index) => (
              <div key={index} className="flex items-center gap-2 text-yellow-700">
                <CheckCircle className="w-4 h-4" />
                <span>{sign}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-yellow-700">
            If you experience 3 or more of these symptoms, consult a sleep specialist.{' '}
            <a href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Hi, I think I might have sleep apnea. Can you help?')}`} className="font-semibold underline">
              We can refer you to a sleep clinic.
            </a>
          </p>
        </div>
      </section>

      {/* CPAP Machines Grid */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">CPAP Machines for Sale & Rent</h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            All CPAP machines include free mask, tubing, and in-home setup training.
            Rental options available for trial before purchase.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {cpapMachines.map((product, index) => (
              <div
                key={index}
                className={`bg-white rounded-xl shadow-lg overflow-hidden border-2 ${
                  product.popular ? 'border-indigo-500' : 'border-transparent'
                }`}
              >
                {product.popular && (
                  <div className="bg-indigo-500 text-white text-center py-2 text-sm font-semibold">
                    Most Popular
                  </div>
                )}
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{product.name}</h3>
                  <p className="text-gray-600 text-sm mb-4">{product.description}</p>

                  <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Wind className="w-4 h-4 text-indigo-600" />
                      <span>{product.pressure}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-indigo-600" />
                      <span>{product.noise}</span>
                    </div>
                  </div>

                  <div className="bg-indigo-50 rounded-lg p-3 mb-4">
                    <div className="text-sm text-gray-600 mb-1">Best for:</div>
                    <div className="text-indigo-700 font-medium">{product.bestFor}</div>
                  </div>

                  <ul className="space-y-2 mb-4">
                    {product.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <div className="text-sm text-gray-500 mb-4">
                    <strong>Includes:</strong> {product.includes.join(', ')}
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <div className="text-sm text-gray-500">Buy:</div>
                        <div className="text-2xl font-bold text-indigo-600">{product.price}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-500">Rent:</div>
                        <div className="text-lg font-semibold text-gray-700">{product.rentalPrice}</div>
                      </div>
                    </div>

                    <a
                      href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hi, I'm interested in the ${product.name}. Can you provide more details?`)}`}
                      className="block w-full bg-green-500 hover:bg-green-600 text-white text-center py-3 rounded-lg font-semibold transition"
                    >
                      <MessageCircle className="inline w-5 h-5 mr-2" />
                      Enquire Now
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CPAP Masks */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">CPAP Masks</h2>
          <p className="text-gray-600 text-center mb-12">
            The right mask is crucial for CPAP success. We help you find the perfect fit.
          </p>

          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {masks.map((mask, index) => (
              <div key={index} className="bg-white rounded-xl p-6 shadow-md">
                <h3 className="text-lg font-bold text-gray-900 mb-2">{mask.name}</h3>
                <p className="text-gray-600 text-sm mb-3">{mask.description}</p>
                <div className="text-indigo-600 font-bold mb-3">{mask.price}</div>
                <ul className="space-y-1">
                  {mask.pros.map((pro, i) => (
                    <li key={i} className="text-sm text-gray-600 flex items-center gap-2">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      {pro}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <a
              href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Hi, I need help choosing a CPAP mask. Can you assist?')}`}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold transition"
            >
              <MessageCircle className="w-5 h-5" />
              Get Mask Fitting Help
            </a>
          </div>
        </div>
      </section>

      {/* How CPAP Works */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">How CPAP Therapy Works</h2>

          <div className="grid md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {[
              {
                step: '1',
                title: 'Air Pressure',
                icon: Wind,
                description: 'CPAP delivers gentle air pressure through a mask while you sleep',
              },
              {
                step: '2',
                title: 'Opens Airway',
                icon: Droplets,
                description: 'The pressure keeps your airway open, preventing collapse',
              },
              {
                step: '3',
                title: 'Better Sleep',
                icon: Moon,
                description: 'You breathe normally without apnea events interrupting sleep',
              },
              {
                step: '4',
                title: 'Wake Refreshed',
                icon: Star,
                description: 'Quality sleep means more energy, focus, and better health',
              },
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CPAP vs No Treatment */}
      <section className="py-16 bg-indigo-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Benefits of CPAP Therapy</h2>

          <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
            <div className="bg-red-50 rounded-xl p-6 border border-red-200">
              <h3 className="text-xl font-bold text-red-700 mb-4">Without Treatment</h3>
              <ul className="space-y-3">
                {[
                  'Chronic fatigue and sleepiness',
                  'Increased risk of heart disease',
                  'Higher blood pressure',
                  'Risk of stroke',
                  'Memory and concentration problems',
                  'Mood disorders and depression',
                  'Dangerous drowsy driving',
                  'Strain on relationships (snoring)',
                ].map((item, index) => (
                  <li key={index} className="flex items-center gap-2 text-red-700">
                    <span className="text-red-500">✕</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-green-50 rounded-xl p-6 border border-green-200">
              <h3 className="text-xl font-bold text-green-700 mb-4">With CPAP Therapy</h3>
              <ul className="space-y-3">
                {[
                  'Wake up refreshed and energized',
                  'Reduced cardiovascular risk',
                  'Better blood pressure control',
                  'Improved memory and focus',
                  'Better mood and outlook',
                  'Safer driving and work',
                  'Quiet sleep for you and partner',
                  'Better overall quality of life',
                ].map((item, index) => (
                  <li key={index} className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>

          <div className="max-w-3xl mx-auto space-y-6">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">{faq.question}</h3>
                <p className="text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-indigo-700 to-purple-700 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Sleep Better?</h2>
          <p className="text-xl text-indigo-100 mb-8 max-w-2xl mx-auto">
            Our sleep therapy specialists can help you find the right CPAP solution.
            Free consultation and mask fitting available.
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <a
              href={`https://wa.me/${whatsappNumber}?text=${whatsappMessage}`}
              className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-8 py-4 rounded-lg font-semibold text-lg transition"
            >
              <MessageCircle className="w-6 h-6" />
              WhatsApp Consultation
            </a>
            <a
              href={`tel:+${whatsappNumber}`}
              className="inline-flex items-center gap-2 bg-white text-indigo-700 px-8 py-4 rounded-lg font-semibold text-lg transition hover:bg-indigo-50"
            >
              <Phone className="w-6 h-6" />
              +60 12-618 1683
            </a>
          </div>

          <p className="mt-8 text-indigo-200 text-sm">
            Also available on Shopee & Lazada | Search for &quot;Evin Medical&quot;
          </p>
        </div>
      </section>

      {/* Schema.org JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'MedicalWebPage',
            name: 'CPAP Machines Malaysia',
            description: 'Buy or rent CPAP machines in Malaysia for sleep apnea treatment. MMDR registered supplier.',
            url: 'https://chatuncle.my/medical-devices/cpap-machines',
            about: {
              '@type': 'MedicalCondition',
              name: 'Obstructive Sleep Apnea',
              alternateName: 'OSA',
            },
            publisher: {
              '@type': 'Organization',
              name: 'AA Alive Sdn Bhd',
              url: 'https://chatuncle.my',
            },
            mainEntity: {
              '@type': 'ItemList',
              itemListElement: cpapMachines.map((product, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                item: {
                  '@type': 'Product',
                  name: product.name,
                  description: product.description,
                  offers: {
                    '@type': 'Offer',
                    price: product.price.replace('RM ', '').replace(',', ''),
                    priceCurrency: 'MYR',
                    availability: 'https://schema.org/InStock',
                    seller: {
                      '@type': 'Organization',
                      name: 'AA Alive Sdn Bhd',
                    },
                  },
                },
              })),
            },
          }),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqs.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
              },
            })),
          }),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
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
                name: 'CPAP Machines',
                item: 'https://chatuncle.my/medical-devices/cpap-machines',
              },
            ],
          }),
        }}
      />
    </div>
  );
}
