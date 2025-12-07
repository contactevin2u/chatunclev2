import type { Metadata } from 'next';
import Link from 'next/link';
import { Phone, MessageCircle, Truck, Shield, Award, CheckCircle, Star, Battery, Gauge, Weight, Settings, ChevronRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Electric Wheelchair Malaysia | Motorized Wheelchair | AA Alive Sdn Bhd',
  description: 'Buy or rent electric wheelchairs in Malaysia. MMDR registered supplier. Lightweight folding electric wheelchairs, heavy-duty motorized wheelchairs. Free delivery KL & Selangor. Superbrands 2025.',
  keywords: [
    'electric wheelchair malaysia',
    'motorized wheelchair malaysia',
    'electric wheelchair price malaysia',
    'kerusi roda elektrik',
    'kerusi roda motor',
    'beli kerusi roda elektrik',
    'sewa kerusi roda elektrik',
    'lightweight electric wheelchair malaysia',
    'folding electric wheelchair malaysia',
    'heavy duty electric wheelchair',
    'power wheelchair malaysia',
    'wheelchair rental malaysia',
    'electric wheelchair for elderly',
    'electric wheelchair for disabled',
    'portable electric wheelchair',
    'electric wheelchair battery',
    'electric wheelchair repair malaysia',
    'electric wheelchair kuala lumpur',
    'electric wheelchair selangor',
    'electric wheelchair johor',
    'electric wheelchair penang',
    'AA Alive wheelchair',
    'Evin electric wheelchair',
    'MMDR registered wheelchair supplier',
    'cheap electric wheelchair malaysia',
    'best electric wheelchair malaysia',
  ],
  openGraph: {
    title: 'Electric Wheelchair Malaysia | Motorized Wheelchair',
    description: 'MMDR registered electric wheelchair supplier. Buy or rent lightweight, folding, and heavy-duty models. Free delivery KL & Selangor.',
    url: 'https://chatuncle.my/medical-devices/electric-wheelchairs',
    siteName: 'AA Alive - ChatUncle',
    locale: 'en_MY',
    type: 'website',
  },
  alternates: {
    canonical: 'https://chatuncle.my/medical-devices/electric-wheelchairs',
  },
};

const electricWheelchairs = [
  {
    name: 'Lightweight Folding Electric Wheelchair',
    description: 'Ultra-portable design, folds in seconds. Perfect for travel and easy storage.',
    weight: '23kg',
    maxLoad: '120kg',
    battery: '24V 10Ah Li-ion',
    range: '15-20km',
    speed: '6 km/h',
    price: 'RM 3,500',
    rentalPrice: 'RM 350/month',
    features: ['Folds in 3 seconds', 'Airline approved size', 'Removable battery', 'Joystick control'],
    bestFor: 'Travel, compact spaces, active users',
    popular: true,
  },
  {
    name: 'Standard Electric Wheelchair',
    description: 'Reliable everyday mobility solution with comfortable seating and stable performance.',
    weight: '35kg',
    maxLoad: '150kg',
    battery: '24V 20Ah Lead Acid',
    range: '25-30km',
    speed: '8 km/h',
    price: 'RM 2,800',
    rentalPrice: 'RM 280/month',
    features: ['Adjustable armrests', 'Swing-away footrests', 'Anti-tip wheels', 'Electromagnetic brakes'],
    bestFor: 'Daily indoor/outdoor use',
    popular: true,
  },
  {
    name: 'Heavy Duty Electric Wheelchair',
    description: 'Extra-strong frame for larger users. Reinforced construction and powerful motors.',
    weight: '55kg',
    maxLoad: '200kg',
    battery: '24V 40Ah Lead Acid',
    range: '35-40km',
    speed: '8 km/h',
    price: 'RM 5,500',
    rentalPrice: 'RM 500/month',
    features: ['Reinforced steel frame', 'Dual motors', 'Wide 22" seat', 'Heavy-duty tires'],
    bestFor: 'Users up to 200kg, rough terrain',
    popular: false,
  },
  {
    name: 'Reclining Electric Wheelchair',
    description: 'Full recline capability for pressure relief and comfort during long use.',
    weight: '45kg',
    maxLoad: '150kg',
    battery: '24V 20Ah Li-ion',
    range: '25km',
    speed: '6 km/h',
    price: 'RM 6,800',
    rentalPrice: 'RM 600/month',
    features: ['180° recline', 'Elevating leg rests', 'Headrest included', 'Pressure relief cushion'],
    bestFor: 'Extended sitting, pressure sore prevention',
    popular: false,
  },
  {
    name: 'Standing Electric Wheelchair',
    description: 'Innovative design allows users to stand upright. Promotes circulation and independence.',
    weight: '85kg',
    maxLoad: '120kg',
    battery: '24V 50Ah Li-ion',
    range: '20km',
    speed: '6 km/h',
    price: 'RM 18,000',
    rentalPrice: 'RM 1,500/month',
    features: ['Full standing position', 'Powered leg support', 'Anti-tip system', 'Eye-level interaction'],
    bestFor: 'Active rehabilitation, workplace accessibility',
    popular: false,
  },
  {
    name: 'All-Terrain Electric Wheelchair',
    description: 'Designed for outdoor adventures. Large wheels and powerful motors for any surface.',
    weight: '65kg',
    maxLoad: '150kg',
    battery: '24V 35Ah Li-ion',
    range: '30km',
    speed: '10 km/h',
    price: 'RM 12,000',
    rentalPrice: 'RM 1,000/month',
    features: ['14" off-road tires', 'Suspension system', 'Weather resistant', 'Powerful 500W motors'],
    bestFor: 'Outdoor use, uneven terrain, parks',
    popular: false,
  },
];

const manualWheelchairs = [
  {
    name: 'Basic Manual Wheelchair',
    price: 'RM 350',
    rental: 'RM 80/month',
  },
  {
    name: 'Lightweight Aluminum Wheelchair',
    price: 'RM 650',
    rental: 'RM 100/month',
  },
  {
    name: 'Transport Wheelchair',
    price: 'RM 450',
    rental: 'RM 90/month',
  },
  {
    name: 'Reclining Manual Wheelchair',
    price: 'RM 1,200',
    rental: 'RM 150/month',
  },
];

const faqs = [
  {
    question: 'How long does the battery last on an electric wheelchair?',
    answer: 'Battery life depends on the model and usage. Most of our electric wheelchairs offer 15-40km range per charge. Li-ion batteries last 3-5 years, while lead-acid batteries last 1-2 years. We offer battery replacement services.',
  },
  {
    question: 'Can electric wheelchairs be used in the rain?',
    answer: 'Most electric wheelchairs are splash-resistant but not waterproof. Light rain is generally fine, but avoid heavy rain and puddles. Our all-terrain model has better water resistance. Always dry the wheelchair after exposure to moisture.',
  },
  {
    question: 'How do I charge an electric wheelchair?',
    answer: 'Simply plug the charger into a standard wall outlet and connect to the wheelchair. Most models charge in 6-8 hours. We recommend charging overnight. Never use non-original chargers as they may damage the battery.',
  },
  {
    question: 'Can I bring an electric wheelchair on an airplane?',
    answer: 'Yes! Our lightweight folding models are airline approved. The battery must be under 300Wh (most are). Inform your airline 48 hours before travel. The wheelchair can be gate-checked and will be waiting at your destination gate.',
  },
  {
    question: 'What is the weight limit for electric wheelchairs?',
    answer: 'Standard models support 120-150kg. Our heavy-duty model supports up to 200kg. Exceeding the weight limit reduces battery life, speed, and may damage the motor. Always choose a wheelchair rated for your weight plus a 20% margin.',
  },
  {
    question: 'Do you provide wheelchair repair and maintenance?',
    answer: 'Yes! We offer full repair and maintenance services. This includes battery replacement, motor repair, joystick replacement, tire changes, and general servicing. We also sell spare parts for all models we carry.',
  },
  {
    question: 'How do I choose between manual and electric wheelchair?',
    answer: 'Electric wheelchairs are best for users who have limited upper body strength, need to travel longer distances, or want more independence. Manual wheelchairs are lighter, cheaper, and better for short distances or when caregivers are always present.',
  },
  {
    question: 'Is there a trial period before buying?',
    answer: 'We offer a 7-day rental trial before purchase. If you decide to buy, the rental amount is credited towards your purchase. This lets you test the wheelchair in your actual environment before committing.',
  },
];

export default function ElectricWheelchairsPage() {
  const whatsappNumber = '60126181683';
  const whatsappMessage = encodeURIComponent('Hi, I\'m interested in electric wheelchairs. Can you help me choose the right one?');

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 text-white py-16">
        <div className="container mx-auto px-4">
          <nav className="text-sm mb-6 text-purple-200">
            <Link href="/" className="hover:text-white">Home</Link>
            <ChevronRight className="inline w-4 h-4 mx-2" />
            <Link href="/medical-devices" className="hover:text-white">Medical Devices</Link>
            <ChevronRight className="inline w-4 h-4 mx-2" />
            <span className="text-white">Electric Wheelchairs</span>
          </nav>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-purple-800/50 px-4 py-2 rounded-full text-sm mb-4">
                <Award className="w-4 h-4 text-yellow-400" />
                <span>MMDR Registered | Superbrands 2025</span>
              </div>

              <h1 className="text-4xl md:text-5xl font-bold mb-4">
                Electric Wheelchair Malaysia
              </h1>
              <p className="text-xl text-purple-100 mb-6">
                Buy or rent electric wheelchairs and motorized wheelchairs. Lightweight folding to heavy-duty models.
                Free delivery & demo in KL & Selangor.
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
                  className="inline-flex items-center gap-2 bg-white text-purple-700 px-6 py-3 rounded-lg font-semibold transition hover:bg-purple-50"
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
                    <p className="text-purple-200 text-sm">Official Medical Device Authority Malaysia registered supplier</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Truck className="w-6 h-6 text-green-400 mt-1" />
                  <div>
                    <strong>Free Delivery & Demo</strong>
                    <p className="text-purple-200 text-sm">Free delivery in KL & Selangor with in-home demonstration</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Settings className="w-6 h-6 text-green-400 mt-1" />
                  <div>
                    <strong>Full Service Support</strong>
                    <p className="text-purple-200 text-sm">Repair, maintenance, and spare parts for all models</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Star className="w-6 h-6 text-green-400 mt-1" />
                  <div>
                    <strong>7-Day Trial</strong>
                    <p className="text-purple-200 text-sm">Rent before you buy with full credit towards purchase</p>
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
              <div className="text-3xl font-bold text-purple-600">1000+</div>
              <div className="text-sm text-gray-600">Happy Customers</div>
            </div>
            <div className="h-12 w-px bg-gray-200 hidden md:block" />
            <div>
              <div className="text-3xl font-bold text-purple-600">15+</div>
              <div className="text-sm text-gray-600">Wheelchair Models</div>
            </div>
            <div className="h-12 w-px bg-gray-200 hidden md:block" />
            <div>
              <div className="text-3xl font-bold text-purple-600">1 Year</div>
              <div className="text-sm text-gray-600">Motor Warranty</div>
            </div>
            <div className="h-12 w-px bg-gray-200 hidden md:block" />
            <div>
              <div className="text-3xl font-bold text-purple-600">Same Day</div>
              <div className="text-sm text-gray-600">Delivery Available</div>
            </div>
          </div>
        </div>
      </section>

      {/* Electric Wheelchairs Grid */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">Electric Wheelchairs for Sale & Rent</h2>
          <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
            Choose from our range of motorized wheelchairs. All models include warranty, free delivery,
            and professional setup. Rental options available for all wheelchairs.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {electricWheelchairs.map((product, index) => (
              <div
                key={index}
                className={`bg-white rounded-xl shadow-lg overflow-hidden border-2 ${
                  product.popular ? 'border-purple-500' : 'border-transparent'
                }`}
              >
                {product.popular && (
                  <div className="bg-purple-500 text-white text-center py-2 text-sm font-semibold">
                    Best Seller
                  </div>
                )}
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{product.name}</h3>
                  <p className="text-gray-600 text-sm mb-4">{product.description}</p>

                  <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Weight className="w-4 h-4 text-purple-600" />
                      <span>{product.weight}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-purple-600" />
                      <span>{product.speed}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Battery className="w-4 h-4 text-purple-600" />
                      <span>{product.range}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-purple-600" />
                      <span>Max {product.maxLoad}</span>
                    </div>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-3 mb-4">
                    <div className="text-sm text-gray-600 mb-1">Best for:</div>
                    <div className="text-purple-700 font-medium">{product.bestFor}</div>
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
                        <div className="text-2xl font-bold text-purple-600">{product.price}</div>
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

      {/* Manual Wheelchairs */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">Manual Wheelchairs Also Available</h2>
          <p className="text-gray-600 text-center mb-12">Looking for manual wheelchairs? We have those too!</p>

          <div className="grid md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {manualWheelchairs.map((item, index) => (
              <div key={index} className="bg-white rounded-lg p-6 shadow-md text-center">
                <h3 className="font-bold text-gray-900 mb-3">{item.name}</h3>
                <div className="text-2xl font-bold text-purple-600 mb-1">{item.price}</div>
                <div className="text-sm text-gray-500">or {item.rental}</div>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <a
              href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Hi, I\'m interested in manual wheelchairs. What options do you have?')}`}
              className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition"
            >
              <MessageCircle className="w-5 h-5" />
              View All Manual Wheelchairs
            </a>
          </div>
        </div>
      </section>

      {/* Wheelchair Selection Guide */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">How to Choose the Right Wheelchair</h2>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-purple-600">1</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Consider Your Lifestyle</h3>
              <ul className="space-y-2 text-gray-600">
                <li>• Indoor only? Standard model works</li>
                <li>• Travel often? Lightweight folding</li>
                <li>• Outdoor adventures? All-terrain</li>
                <li>• Long hours sitting? Reclining model</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-purple-600">2</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Check Specifications</h3>
              <ul className="space-y-2 text-gray-600">
                <li>• Weight capacity (your weight + 20%)</li>
                <li>• Seat width (measure hip width + 2&quot;)</li>
                <li>• Battery range (daily travel needs)</li>
                <li>• Total weight (for car transport)</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl font-bold text-purple-600">3</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Try Before You Buy</h3>
              <ul className="space-y-2 text-gray-600">
                <li>• Use our 7-day rental trial</li>
                <li>• Test in your actual environment</li>
                <li>• Check doorway and car fit</li>
                <li>• Rental credited towards purchase</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-16 bg-purple-50">
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
      <section className="py-16 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Regain Your Mobility?</h2>
          <p className="text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
            Our mobility specialists can help you find the perfect electric wheelchair.
            Free consultation and home demonstration available.
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
              className="inline-flex items-center gap-2 bg-white text-purple-700 px-8 py-4 rounded-lg font-semibold text-lg transition hover:bg-purple-50"
            >
              <Phone className="w-6 h-6" />
              +60 12-618 1683
            </a>
          </div>

          <p className="mt-8 text-purple-200 text-sm">
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
            name: 'Electric Wheelchairs Malaysia',
            description: 'Buy or rent electric wheelchairs in Malaysia. MMDR registered supplier.',
            url: 'https://chatuncle.my/medical-devices/electric-wheelchairs',
            publisher: {
              '@type': 'Organization',
              name: 'AA Alive Sdn Bhd',
              url: 'https://chatuncle.my',
            },
            mainEntity: {
              '@type': 'ItemList',
              itemListElement: electricWheelchairs.map((product, index) => ({
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
                name: 'Electric Wheelchairs',
                item: 'https://chatuncle.my/medical-devices/electric-wheelchairs',
              },
            ],
          }),
        }}
      />
    </div>
  );
}
