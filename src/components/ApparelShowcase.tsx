import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShoppingBag, Shirt, Star, ArrowRight, CheckCircle, Globe, Sparkles, Award, Tag, Package, ExternalLink } from 'lucide-react';

const collections = [
  {
    id: 'tiger',
    name: 'Tiger Edition',
    tagline: 'Unleash your inner predator',
    description: 'The Tiger Edition channels raw power and fearless energy. Crafted for those who command every room they enter. With bold stripes and a heavyweight cut, this is statement dressing at its finest.',
    price: 'From ZAR 999',
    image: './lovable-uploads/item1.webp',
    gradient: 'from-orange-500 via-amber-500 to-yellow-500',
    glow: 'rgba(251,146,60,0.4)',
    gsm: '200 GSM Organic Cotton',
    badge: 'Bestseller',
    features: ['Signature Tiger Motif', 'Heavyweight Organic Cotton', 'Limited-Run Print', 'Double-Stitched Hem'],
  },
  {
    id: 'panther',
    name: 'Panther Edition',
    tagline: 'Sleek. Sophisticated. Silent.',
    description: 'The Panther Edition embodies quiet luxury. Understated on the surface, extraordinary in detail. For the music lover who lets their presence speak louder than words.',
    price: 'From ZAR 1,299',
    image: './lovable-uploads/item2.webp',
    gradient: 'from-purple-600 via-violet-600 to-indigo-700',
    glow: 'rgba(139,92,246,0.4)',
    gsm: '180 GSM Premium Cotton',
    badge: 'Fan Favourite',
    features: ['Monochrome Panther Emblem', 'Slim Premium Cut', 'Colourfast Fabric', 'Brushed Inner Lining'],
  },
  {
    id: 'ghost',
    name: 'Ghost Edition',
    tagline: 'Invisible luxury. Undeniable presence.',
    description: 'The Ghost Edition is the apex of the PlayMyJam apparel line. A luxury blend garment with phantom-inspired aesthetics that blur the line between streetwear and high fashion.',
    price: 'From ZAR 2,750',
    image: './lovable-uploads/item3.webp',
    gradient: 'from-slate-500 via-gray-600 to-zinc-700',
    glow: 'rgba(148,163,184,0.4)',
    gsm: '220 GSM Luxury Blend',
    badge: 'Limited Edition',
    features: ['Ghost-Tone Embossed Print', 'Luxury Fabric Blend', 'Numbered Edition Tag', "Collector's Packaging"],
  },
];

const brandPillars = [
  {
    icon: Globe,
    title: 'Physical-Digital Identity',
    description: 'Every PlayMyJam garment carries a unique QR code linking back to your digital profile and music taste — bridging the physical and digital worlds.',
    gradient: 'from-purple-500 to-blue-500',
  },
  {
    icon: Sparkles,
    title: 'Music-Born Streetwear',
    description: 'Our apparel is born from the culture of live music, DJs, and nightlife. Each drop reflects a sound, a vibe, a movement.',
    gradient: 'from-pink-500 to-rose-500',
  },
  {
    icon: Award,
    title: 'Premium Craftsmanship',
    description: 'We use sustainably sourced organic cotton and luxury blends — never fast fashion. Every stitch is intentional, every garment a work of art.',
    gradient: 'from-amber-500 to-orange-500',
  },
  {
    icon: Tag,
    title: 'Open Brand Portal',
    description: 'We invite established and emerging brands to sell alongside us on the PlayMyJam Brand Portal — our curated marketplace for culture-driven apparel.',
    gradient: 'from-emerald-500 to-teal-600',
  },
];

const ApparelShowcase = () => {
  const [activeCollection, setActiveCollection] = useState(0);
  const active = collections[activeCollection];

  return (
    <section className="py-28 relative overflow-hidden" id="apparel">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-purple-700/20 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-pink-700/20 blur-3xl" />
      </div>

      <div className="container mx-auto px-6 relative z-10">

        <div className="text-center mb-20 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-5 py-2 mb-6">
            <Shirt className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-gray-300 font-semibold tracking-widest uppercase">PlayMyJam Apparel</span>
          </div>
          <h2 className="text-4xl lg:text-6xl font-playfair font-bold text-white mb-6 leading-tight">
            The Only{' '}
            <span className="neon-text">Physical Digital</span>
            <br />
            Identity in Music Culture
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
            PlayMyJam Apparel is more than clothing — it is wearable tech-culture. Each garment encodes your music identity,
            blending the energy of the dancefloor with the craftsmanship of luxury fashion. Wear who you are.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-24">
          {brandPillars.map((pillar, i) => (
            <div
              key={i}
              className="glass-card p-6 hover-lift group animate-fade-in-up"
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${pillar.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                <pillar.icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2 font-playfair">{pillar.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{pillar.description}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {collections.map((col, i) => (
            <button
              key={i}
              onClick={() => setActiveCollection(i)}
              className={`px-6 py-3 rounded-full font-semibold text-sm transition-all duration-300 border ${
                activeCollection === i
                  ? `bg-gradient-to-r ${col.gradient} text-white border-transparent shadow-lg scale-105`
                  : 'bg-white/5 border-white/20 text-gray-300 hover:border-white/40'
              }`}
            >
              {col.name}
            </button>
          ))}
        </div>

        <div
          className="glass-card p-8 lg:p-12 animate-fade-in-up mb-24"
          style={{ boxShadow: `0 0 80px ${active.glow}` }}
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="relative">
              <div className={`absolute inset-0 bg-gradient-to-br ${active.gradient} rounded-3xl blur-2xl opacity-30 scale-110`} />
              <div className="relative overflow-hidden rounded-3xl">
                <img
                  src={active.image}
                  alt={active.name}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-[420px] object-cover transition-transform duration-700 hover:scale-105"
                />
                <div className={`absolute inset-0 bg-gradient-to-t ${active.gradient} opacity-20`} />
                <div className={`absolute top-4 left-4 bg-gradient-to-r ${active.gradient} text-white text-xs font-bold px-4 py-1.5 rounded-full`}>
                  {active.badge}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <p className={`text-sm font-semibold uppercase tracking-widest bg-gradient-to-r ${active.gradient} bg-clip-text text-transparent mb-2`}>
                  {active.tagline}
                </p>
                <h3 className="text-4xl font-playfair font-bold text-white mb-3">{active.name}</h3>
                <p className="text-gray-300 leading-relaxed text-lg">{active.description}</p>
              </div>

              <div className="flex items-center gap-4">
                <span className={`text-3xl font-bold bg-gradient-to-r ${active.gradient} bg-clip-text text-transparent`}>
                  {active.price}
                </span>
                <div className="flex items-center gap-1 text-yellow-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-current" />
                  ))}
                </div>
              </div>

              <div className="bg-white/5 rounded-2xl p-4">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-semibold">Fabric Spec</div>
                <div className="text-white font-semibold">{active.gsm}</div>
              </div>

              <ul className="space-y-3">
                {active.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-gray-300">
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <a
                  href="#download-section"
                  onClick={(e) => {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="flex-1"
                >
                  <Button
                    className={`w-full bg-gradient-to-r ${active.gradient} text-white hover:scale-105 hover:shadow-xl transition-all duration-300 py-6 text-base font-semibold`}
                  >
                    <ShoppingBag className="w-5 h-5 mr-2" />
                    Available on Mobile App
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </a>
                <a
                  href="#brand-partners"
                  className="flex-1"
                >
                  <Button
                    variant="outline"
                    className="w-full border-white/30 text-white hover:bg-white/10 py-6 text-base font-semibold"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Partner as a Brand
                  </Button>
                </a>
              </div>
              <p className="text-xs text-gray-400 italic">
                * All apparel purchases, size selection, and ownership claiming take place exclusively within the PlayMyJam mobile app.
              </p>
            </div>
          </div>
        </div>

        <div className="text-center mb-12 animate-fade-in-up">
          <h3 className="text-3xl lg:text-4xl font-playfair font-bold text-white mb-4">
            How Our <span className="neon-text">Physical-Digital</span> Identity Works
          </h3>
          <p className="text-gray-300 max-w-2xl mx-auto">
            Every PlayMyJam garment is a living link between the real world and your digital music life.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-20">
          {[
            {
              step: '01',
              icon: Package,
              title: 'Order in Mobile App',
              description: 'Select your edition, size, and cut inside the PlayMyJam app. Every piece is dispatched with an authentic serialized QR identity tag.',
              gradient: 'from-purple-500 to-indigo-600',
            },
            {
              step: '02',
              icon: Sparkles,
              title: 'Scan & Authenticate',
              description: 'Scan the garment’s QR code using the PlayMyJam mobile camera to verify genuine authenticity against our secure backend registry.',
              gradient: 'from-pink-500 to-rose-600',
            },
            {
              step: '03',
              icon: Globe,
              title: 'Claim Digital Identity',
              description: 'Link the garment to your PlayMyJam music profile. Flaunt your taste, DJ affinities, and unlock curated VIP community privileges.',
              gradient: 'from-amber-500 to-orange-600',
            },
          ].map((step, i) => (
            <div
              key={i}
              className="glass-card p-8 hover-lift group text-center animate-fade-in-up"
              style={{ animationDelay: `${i * 0.2}s` }}
            >
              <div className="text-6xl font-bold text-white/10 font-playfair mb-4">{step.step}</div>
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${step.gradient} flex items-center justify-center mx-auto mb-5 group-hover:scale-110 transition-transform duration-300`}>
                <step.icon className="w-8 h-8 text-white" />
              </div>
              <h4 className="text-xl font-bold text-white font-playfair mb-3">{step.title}</h4>
              <p className="text-gray-400 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>

        {/* Brand Ecosystem Bridge Card */}
        <div className="glass-card p-10 lg:p-16 text-center animate-fade-in-up relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 via-pink-600/20 to-emerald-600/20 pointer-events-none" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-4 py-1.5 mb-5 text-emerald-400 text-xs font-semibold tracking-wider uppercase">
              Brand Partnership Opportunity
            </div>
            <h3 className="text-3xl lg:text-4xl font-playfair font-bold text-white mb-4">
              Are You an Apparel Brand or Fashion Designer?
            </h3>
            <p className="text-gray-300 max-w-3xl mx-auto mb-8 text-lg leading-relaxed">
              Bring your apparel into the PlayMyJam ecosystem. Issue scannable physical-digital identities, protect your designs with backend counterfeit verification, and sell directly to our community through the PlayMyJam mobile app.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a
                href="https://pmj.brands.empirelabs.digital/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-emerald-500 via-teal-600 to-cyan-600 text-white hover:scale-105 hover:shadow-2xl transition-all duration-300 px-10 py-6 text-base font-bold rounded-full"
                >
                  <Tag className="w-5 h-5 mr-2" />
                  Join PlayMyJam as a Brand
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </a>
              <a href="#brand-partners">
                <Button
                  variant="outline"
                  size="lg"
                  className="border-white/30 text-white hover:bg-white/10 px-8 py-6 text-base font-semibold rounded-full"
                >
                  Learn How Brand Onboarding Works
                </Button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ApparelShowcase;
