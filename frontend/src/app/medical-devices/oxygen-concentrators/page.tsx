import type { Metadata } from 'next';
import Link from 'next/link';
import { Phone, MessageCircle, Truck, Shield, Award, CheckCircle, Star, Clock, Heart, Wind, Zap, Volume2, ChevronRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Oxygen Concentrator Malaysia | Home & Hospital Use | AA Alive Sdn Bhd',
  description: 'Buy or rent oxygen concentrators in Malaysia. MMDR registered supplier. 5L, 8L, 10L home oxygen concentrators. Portable & stationary models. Free delivery KL & Selangor. Superbrands 2025.',
  keywords: [
    'oxygen concentrator malaysia',
    'oxygen concentrator price malaysia',
    'beli oxygen concentrator',
    'sewa oxygen concentrator',
    'home oxygen concentrator malaysia',
    'portable oxygen concentrator malaysia',
    'oxygen machine malaysia',
    'mesin oksigen malaysia',
    '5 liter oxygen concentrator',
    '8 liter oxygen concentrator',
    '10 liter oxygen concentrator',
    'oxygen concentrator rental malaysia',
    'oxygen concentrator for sale malaysia',
    'medical oxygen concentrator',
    'hospital oxygen concentrator',
    'oxygen therapy equipment malaysia',
    'COPD oxygen therapy malaysia',
    'home oxygen therapy',
    'portable oxygen machine',
    'oxygen concentrator kuala lumpur',
    'oxygen concentrator selangor',
    'oxygen concentrator johor',
    'oxygen concentrator penang',
    'AA Alive oxygen concentrator',
    'Evin oxygen concentrator',
    'MMDR registered oxygen supplier',
  ],
  openGraph: {
    title: 'Oxygen Concentrator Malaysia | Home & Hospital Use',
    description: 'MMDR registered oxygen concentrator supplier. Buy or rent 5L-10L units. Free delivery KL & Selangor.',
    url: 'https://chatuncle.my/medical-devices/oxygen-concentrators',
    siteName: 'AA Alive - ChatUncle',
    locale: 'en_MY',
    type: 'website',
  },
  alternates: {
    canonical: 'https://chatuncle.my/medical-devices/oxygen-concentrators',
  },
};

const oxygenConcentrators = [
  {
    name: '5L Home Oxygen Concentrator',
    description: 'Quiet operation, perfect for home use. Continuous flow up to 5 liters per minute.',
    flow: '1-5 LPM',
    purity: '93% ± 3%',
    noise: '≤45 dB',
    power: '350W',
    weight: '18kg',
    price: 'RM 2,800',
    rentalPrice: 'RM 200/month',
    features: ['Quiet operation', 'Timer function', 'Low oxygen alarm', 'Power failure alarm'],
    bestFor: 'Home use, mild to moderate oxygen needs',
    popular: true,
  },
  {
    name: '8L Medical Oxygen Concentrator',
    description: 'Higher flow rate for patients requiring more oxygen. Hospital-grade quality.',
    flow: '1-8 LPM',
    purity: '93% ± 3%',
    noise: '≤48 dB',
    power: '480W',
    weight: '23kg',
    price: 'RM 3,800',
    rentalPrice: 'RM 280/month',
    features: ['Dual outlet option', 'Remote monitoring', 'Auto-shutoff', 'Hour meter'],
    bestFor: 'Higher oxygen needs, multiple users',
    popular: false,
  },
  {
    name: '10L Heavy Duty Oxygen Concentrator',
    description: 'Maximum output for severe respiratory conditions. Industrial-grade reliability.',
    flow: '1-10 LPM',
    purity: '93% ± 3%',
    noise: '≤52 dB',
    power: '600W',
    weight: '28kg',
    price: 'RM 4,800',
    rentalPrice: 'RM 380/month',
    features: ['Continuous 24/7 operation', 'Nebulizer port', 'Industrial compressor', 'Extended warranty'],
    bestFor: 'Severe COPD, hospital use',
    popular: false,
  },
  {
    name: 'Portable Oxygen Concentrator',
    description: 'Lightweight and battery-powered. Travel-friendly for active lifestyles.',
    flow: '1-5 LPM (pulse)',
    purity: '90% ± 3%',
    noise: '≤40 dB',
    power: '40W',
    weight: '2.5kg',
    price: 'RM 6,500',
    rentalPrice: 'RM 450/month',
    features: ['Battery powered', 'FAA approved', 'Car adapter', 'Carry bag included'],
    bestFor: 'Travel, active lifestyle, mobility',
    popular: true,
  },
  {
    name: 'Dual Flow Oxygen Concentrator',
    description: 'Two independent outlets for treating two patients simultaneously.',
    flow: '2 x 5 LPM',
    purity: '93% ± 3%',
    noise: '≤50 dB',
    power: '550W',
    weight: '25kg',
    price: 'RM 5,200',
    rentalPrice: 'RM 400/month',
    features: ['Dual outlets', 'Independent flow control', 'Cost-effective for couples', 'Hospital grade'],
    bestFor: 'Two patients, clinics, nursing homes',
    popular: false,
  },
  {
    name: 'Pediatric Oxygen Concentrator',
    description: 'Specially designed for children with lower flow rates and gentle delivery.',
    flow: '0.5-3 LPM',
    purity: '93% ± 3%',
    noise: '≤42 dB',
    power: '280W',
    weight: '15kg',
    price: 'RM 3,200',
    rentalPrice: 'RM 250/month',
    features: ['Child-safe design', 'Gentle flow', 'Colorful display', 'Parent lock'],
    bestFor: 'Pediatric patients, neonatal care',
    popular: false,
  },
];

const conditions = [
  { name: 'COPD', description: 'Chronic Obstructive Pulmonary Disease management' },
  { name: 'Pneumonia', description: 'Recovery support during and after infection' },
  { name: 'Asthma', description: 'Severe asthma attack support' },
  { name: 'Sleep Apnea', description: 'Combined with CPAP therapy' },
  { name: 'COVID-19 Recovery', description: 'Post-COVID lung rehabilitation' },
  { name: 'Heart Failure', description: 'Cardiac-related breathing difficulties' },
  { name: 'Pulmonary Fibrosis', description: 'Chronic lung scarring management' },
  { name: 'Post-Surgery', description: 'Recovery after major operations' },
];

const faqs = [
  {
    question: 'How long can an oxygen concentrator run continuously?',
    answer: 'Our home oxygen concentrators are designed for 24/7 continuous operation. They have industrial-grade compressors that can run for years with proper maintenance. We recommend servicing every 12 months.',
  },
  {
    question: 'What is the difference between 5L, 8L, and 10L oxygen concentrators?',
    answer: 'The number refers to the maximum flow rate in liters per minute (LPM). 5L is suitable for most home users, 8L for higher oxygen needs, and 10L for severe respiratory conditions. Your doctor will prescribe the appropriate flow rate.',
  },
  {
    question: 'Do I need a prescription to buy an oxygen concentrator in Malaysia?',
    answer: 'While not legally required for purchase, we strongly recommend consulting a doctor first. Oxygen therapy should be prescribed based on your SpO2 levels and medical condition. We can help connect you with respiratory specialists.',
  },
  {
    question: 'How much electricity does an oxygen concentrator use?',
    answer: 'A 5L unit uses about 350W (similar to a refrigerator). Running 24/7, it costs approximately RM 70-90 per month in electricity. We recommend a UPS backup for uninterrupted power.',
  },
  {
    question: 'Can I travel with a portable oxygen concentrator?',
    answer: 'Yes! Our portable units are FAA-approved for air travel. They come with car adapters and extra batteries. Notify your airline 48 hours before travel and bring your prescription letter.',
  },
  {
    question: 'What maintenance does an oxygen concentrator need?',
    answer: 'Weekly: Clean the air inlet filter. Monthly: Clean the humidifier bottle. Every 2 years: Replace filters and check compressor. We offer annual servicing packages for all our units.',
  },
  {
    question: 'Is renting or buying an oxygen concentrator better?',
    answer: 'For short-term needs (< 6 months), renting is more economical. For long-term use, buying saves money over time. Our rent-to-own program lets you apply rental payments towards purchase.',
  },
  {
    question: 'Do you provide training on how to use the oxygen concentrator?',
    answer: 'Yes! Every purchase or rental includes free in-home training. Our trained technicians will set up the unit, demonstrate proper use, and teach you maintenance. We also provide 24/7 phone support.',
  },
];

export default function OxygenConcentratorsPage() {
  const whatsappNumber = '60126181683';
  const whatsappMessage = encodeURIComponent('Hi, I\'m interested in oxygen concentrators. Can you help me choose the right one?');

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-sky-700 via-sky-600 to-cyan-600 text-white py-16">
        <div className="container mx-auto px-4">
          <nav className="text-sm mb-6 text-sky-200">
            <Link href="/" className="hover:text-white">Home</Link>
            <ChevronRight className="inline w-4 h-4 mx-2" />
            <Link href="/medical-devices" className="hover:text-white">Medical Devices</Link>
            <ChevronRight className="inline w-4 h-4 mx-2" />
            <span className="text-white">Oxygen Concentrators</span>
          </nav>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-sky-800/50 px-4 py-2 rounded-full text-sm mb-4">
                <Award className="w-4 h-4 text-yellow-400" />
                <span>MMDR Registered | Superbrands 2025</span>
              </div>

              <h1 className="text-4xl md:text-5xl font-bold mb-4">
                Oxygen Concentrator Malaysia
              </h1>
              <p className="text-xl text-sky-100 mb-6">
                Buy or rent medical-grade oxygen concentrators. 5L to 10L home units and portable models.
                Free delivery in KL & Selangor. Professional setup and training included.
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
                  className="inline-flex items-center gap-2 bg-white text-sky-700 px-6 py-3 rounded-lg font-semibold transition hover:bg-sky-50"
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
                    <p className="text-sky-200 text-sm">Official Medical Device Authority Malaysia registered supplier</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Truck className="w-6 h-6 text-green-400 mt-1" />
                  <div>
                    <strong>Free Delivery & Setup</strong>
                    <p className="text-sky-200 text-sm">Free delivery in KL & Selangor with professional installation</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Clock className="w-6 h-6 text-green-400 mt-1" />
                  <div>
                    <strong>24/7 Support</strong>
                    <p className="text-sky-200 text-sm">Round-the-clock technical support and emergency service</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Heart className="w-6 h-6 text-green-400 mt-1" />
                  <div>
                    <strong>Rent-to-Own Option</strong>
                    <p className="text-sky-200 text-sm">Flexible payment plans with rental credit towards purchase</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="py-8 bg-white border-b">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center items-center gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-sky-600">500+</div>
              <div className="text-sm text-gray-600">Units Deployed</div>
            </div>
            <div className="h-12 w-px bg-gray-200 hidden md:block" />
            <div>
              <div className="text-3xl font-bold text-sky-600">98%</div>
              <div className="text-sm text-gray-600">Customer Satisfaction</div>
            </div>
            <div className="h-12 w-px bg-gray-200 hidden md:block" />
            <div>
              <div className="text-3xl font-bold text-sky-600">24/7</div>
              <div className="text-sm text-gray-600">Technical Support</div>
            </div>
            <div className="h-12 w-px bg-gray-200 hidden md:block" />
            <div>
              <div className="text-3xl font-bold text-sky-600">2 Years</div>
              <div className="text-sm text-gray-600">Warranty</div>
            </div>
          </div>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">Oxygen Concentrators for Sale & Rent</h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            Choose from our range of medical-grade oxygen concentrators. All units are MMDR registered
            and come with warranty, free delivery, and professional setup.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {oxygenConcentrators.map((product, index) => (
              <div
                key={index}
                className={`bg-white rounded-xl shadow-lg overflow-hidden border-2 ${
                  product.popular ? 'border-sky-500' : 'border-transparent'
                }`}
              >
                {product.popular && (
                  <div className="bg-sky-500 text-white text-center py-2 text-sm font-semibold">
                    Most Popular
                  </div>
                )}
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{product.name}</h3>
                  <p className="text-gray-600 text-sm mb-4">{product.description}</p>

                  <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Wind className="w-4 h-4 text-sky-600" />
                      <span>{product.flow}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-sky-600" />
                      <span>{product.power}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-sky-600" />
                      <span>{product.noise}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-sky-600" />
                      <span>{product.purity}</span>
                    </div>
                  </div>

                  <div className="bg-sky-50 rounded-lg p-3 mb-4">
                    <div className="text-sm text-gray-600 mb-1">Best for:</div>
                    <div className="text-sky-700 font-medium">{product.bestFor}</div>
                  </div>

                  <ul className="space-y-2 mb-6">
                    {product.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <div className="text-sm text-gray-500">Buy:</div>
                        <div className="text-2xl font-bold text-sky-600">{product.price}</div>
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

      {/* How It Works */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">How Oxygen Therapy Works</h2>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                step: '1',
                title: 'Air Intake',
                description: 'The concentrator draws in room air containing 21% oxygen',
              },
              {
                step: '2',
                title: 'Filtration',
                description: 'Multiple filters remove dust, bacteria, and impurities',
              },
              {
                step: '3',
                title: 'Concentration',
                description: 'Zeolite sieve technology removes nitrogen, boosting oxygen to 93%',
              },
              {
                step: '4',
                title: 'Delivery',
                description: 'Pure oxygen is delivered through nasal cannula or mask',
              },
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-sky-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Conditions Treated */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">Conditions Treated with Oxygen Therapy</h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            Oxygen concentrators help manage various respiratory and cardiac conditions.
            Always consult your doctor for proper diagnosis and treatment.
          </p>

          <div className="grid md:grid-cols-4 gap-6">
            {conditions.map((condition, index) => (
              <div key={index} className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition">
                <h3 className="font-bold text-lg text-sky-700 mb-2">{condition.name}</h3>
                <p className="text-gray-600 text-sm">{condition.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-16 bg-sky-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Oxygen Concentrator vs Oxygen Tank</h2>

          <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-sky-600 text-white">
                <tr>
                  <th className="p-4 text-left">Feature</th>
                  <th className="p-4 text-center">Oxygen Concentrator</th>
                  <th className="p-4 text-center">Oxygen Tank</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Unlimited Supply', concentrator: true, tank: false },
                  { feature: 'No Refills Needed', concentrator: true, tank: false },
                  { feature: 'Portable Options', concentrator: true, tank: true },
                  { feature: 'Lower Long-term Cost', concentrator: true, tank: false },
                  { feature: 'Safe for Home Use', concentrator: true, tank: false },
                  { feature: 'Quiet Operation', concentrator: true, tank: true },
                  { feature: 'Electricity Required', concentrator: true, tank: false },
                  { feature: 'Travel Friendly', concentrator: true, tank: false },
                ].map((row, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                    <td className="p-4 font-medium">{row.feature}</td>
                    <td className="p-4 text-center">
                      {row.concentrator ? (
                        <CheckCircle className="w-6 h-6 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-red-500">✕</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {row.tank ? (
                        <CheckCircle className="w-6 h-6 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-red-500">✕</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      <section className="py-16 bg-gradient-to-r from-sky-600 to-cyan-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Need Help Choosing an Oxygen Concentrator?</h2>
          <p className="text-xl text-sky-100 mb-8 max-w-2xl mx-auto">
            Our respiratory equipment specialists can help you find the right oxygen concentrator
            for your needs. Free consultation available.
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
              className="inline-flex items-center gap-2 bg-white text-sky-700 px-8 py-4 rounded-lg font-semibold text-lg transition hover:bg-sky-50"
            >
              <Phone className="w-6 h-6" />
              +60 12-618 1683
            </a>
          </div>

          <p className="mt-8 text-sky-200 text-sm">
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
            name: 'Oxygen Concentrators Malaysia',
            description: 'Buy or rent oxygen concentrators in Malaysia. MMDR registered supplier.',
            url: 'https://chatuncle.my/medical-devices/oxygen-concentrators',
            publisher: {
              '@type': 'Organization',
              name: 'AA Alive Sdn Bhd',
              url: 'https://chatuncle.my',
            },
            mainEntity: {
              '@type': 'ItemList',
              itemListElement: oxygenConcentrators.map((product, index) => ({
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
                name: 'Oxygen Concentrators',
                item: 'https://chatuncle.my/medical-devices/oxygen-concentrators',
              },
            ],
          }),
        }}
      />
    </div>
  );
}
