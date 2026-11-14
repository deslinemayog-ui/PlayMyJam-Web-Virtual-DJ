import React from 'react';
import { Button } from '@/components/ui/button';
import { 
  ArrowRight, 
  Store, 
  ShieldCheck, 
  Smartphone, 
  Sparkles, 
  QrCode, 
  CheckCircle2, 
  ExternalLink,
  Users2,
  Layers,
  HelpCircle
} from 'lucide-react';

const audience = [
  'Clothing Brand Owners',
  'Independent Fashion Designers',
  'Established Apparel Businesses',
  'Emerging Local Fashion Labels',
];

const pillars = [
  {
    icon: ShieldCheck,
    title: 'Physical-Digital Identity & Protection',
    description: 'Every registered garment is paired with a unique serialized QR pass and backend authenticity validation — giving your customers confidence against counterfeiting.',
    gradient: 'from-emerald-500 to-teal-500',
    tag: 'Authenticity',
  },
  {
    icon: Smartphone,
    title: 'Mobile App Distribution',
    description: 'You upload and manage your apparel on the Brand Portal; PlayMyJam sells and showcases your catalog directly to thousands of active customers inside the mobile app.',
    gradient: 'from-purple-500 to-indigo-500',
    tag: 'Seamless Sales',
  },
  {
    icon: Users2,
    title: 'Music & Culture Community',
    description: 'Tap directly into an energetic ecosystem of DJs, clubgoers, nightlife fans, and tastemakers who wear what they listen to and celebrate bold fashion.',
    gradient: 'from-pink-500 to-rose-500',
    tag: 'Live Culture',
  },
  {
    icon: QrCode,
    title: 'Web Brand Studio & QR Passes',
    description: 'Access pmj.brands.empirelabs.digital to manage collections, track orders, and instantly export high-resolution soundwave-embedded QR passes for your print shop.',
    gradient: 'from-amber-500 to-orange-500',
    tag: 'Instant Tech',
  },
];

const onboardingSteps = [
  {
    step: '01',
    title: 'Register on Brand Portal',
    description: 'Create your brand account at pmj.brands.empirelabs.digital using your existing PlayMyJam credentials or new business registration.',
  },
  {
    step: '02',
    title: 'Upload Apparel & Editions',
    description: 'Add your apparel collections with photos, specs, cuts, sizes, colors, and choose standard or limited edition tags.',
  },
  {
    step: '03',
    title: 'Export Print-Ready Passes',
    description: 'Download branded QR passes individually or in bulk ZIP files, ready to stitch or print onto your garment tags.',
  },
  {
    step: '04',
    title: 'Sell & Authenticate in App',
    description: 'Customers discover and buy through the PlayMyJam mobile app, scan their QR pass upon delivery, and claim genuine ownership.',
  },
];

const BrandPartners = () => {
  return (
    <section className="py-24 relative overflow-hidden" id="brand-partners">
      {/* Background glow effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/10 w-96 h-96 rounded-full bg-emerald-600/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/10 w-96 h-96 rounded-full bg-purple-600/15 blur-3xl" />
      </div>

      <div className="container mx-auto px-6 relative z-10">

        {/* Section Header */}
        <div className="text-center mb-16 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-5 py-2 mb-6">
            <Store className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-emerald-300 font-semibold tracking-widest uppercase">
              Partner Brand Program
            </span>
          </div>

          <h2 className="text-4xl lg:text-6xl font-playfair font-bold text-white mb-6 leading-tight">
            Bring Your Brand Into the{' '}
            <span className="neon-text">PlayMyJam Ecosystem</span>
          </h2>

          <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed mb-8">
            Connect your apparel brand to a digital identity, product authentication, counterfeit protection, and a community of customers through music, fashion, and social interaction.
          </p>

          {/* Target Audience Badges */}
          <div className="flex flex-wrap justify-center gap-2.5 max-w-2xl mx-auto">
            <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold mr-2 self-center">
              Built for:
            </span>
            {audience.map((item, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white/5 border border-white/15 text-gray-200"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* Value Proposition Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {pillars.map((pillar, i) => (
            <div
              key={i}
              className="glass-card p-6 hover-lift group relative overflow-hidden animate-fade-in-up flex flex-col justify-between"
              style={{ animationDelay: `${i * 0.12}s` }}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${pillar.gradient} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                    <pillar.icon className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/10 text-gray-300 border border-white/10">
                    {pillar.tag}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2 font-playfair">{pillar.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{pillar.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Clear Role Separation Notice */}
        <div className="glass-card p-6 lg:p-8 rounded-2xl mb-16 border border-white/15 bg-white/[0.03]">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm uppercase tracking-wider">
                <Store className="w-4 h-4" />
                <span>Brand Portal — pmj.brands.empirelabs.digital</span>
              </div>
              <h4 className="text-xl font-bold text-white font-playfair">Exclusively for Brand Owners & Designers</h4>
              <p className="text-sm text-gray-300 leading-relaxed">
                The portal is NOT an online clothing shop for general customers. It is the dedicated workspace where brand partners register their businesses, upload apparel styles, manage stock, and export secure serialized QR code passes.
              </p>
            </div>

            <div className="space-y-3 md:border-l md:border-white/10 md:pl-8">
              <div className="flex items-center gap-2 text-purple-400 font-bold text-sm uppercase tracking-wider">
                <Smartphone className="w-4 h-4" />
                <span>PlayMyJam Mobile Application</span>
              </div>
              <h4 className="text-xl font-bold text-white font-playfair">Where Customers Discover & Purchase</h4>
              <p className="text-sm text-gray-300 leading-relaxed">
                All consumer apparel browsing, sizing selection, secure in-app payments, order fulfillment, and physical garment QR scanning/ownership claims happen inside the official PlayMyJam mobile app.
              </p>
            </div>
          </div>
        </div>

        {/* Step by Step Onboarding Process */}
        <div className="glass-card p-8 lg:p-12 animate-fade-in-up mb-16" id="brand-how-it-works">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-purple-400">
              Clear 4-Step Journey
            </span>
            <h3 className="text-3xl lg:text-4xl font-playfair font-bold text-white mt-2 mb-3">
              How Brand Onboarding Works
            </h3>
            <p className="text-gray-400 max-w-2xl mx-auto">
              From business registration to scannable physical merchandise in customer hands.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {onboardingSteps.map((item, i) => (
              <div key={i} className="glass-card p-6 bg-white/[0.02] border border-white/10 rounded-xl relative group">
                <div className="text-5xl font-extrabold text-white/10 font-playfair mb-3 leading-none group-hover:text-emerald-400/20 transition-colors">
                  {item.step}
                </div>
                <h4 className="text-lg font-bold text-white mb-2 font-playfair">{item.title}</h4>
                <p className="text-gray-400 text-xs leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Primary Call to Action */}
        <div className="text-center animate-fade-in-up">
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
                <Store className="w-5 h-5 mr-3" />
                Join PlayMyJam as a Brand
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </a>

            <a href="#brand-how-it-works">
              <Button
                variant="outline"
                size="lg"
                className="border-white/30 text-white hover:bg-white/10 px-8 py-6 text-base font-semibold rounded-full"
              >
                <HelpCircle className="w-5 h-5 mr-2 text-gray-300" />
                How It Works
              </Button>
            </a>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Already have a PlayMyJam account? You can log in directly at pmj.brands.empirelabs.digital
          </p>
        </div>

      </div>
    </section>
  );
};

export default BrandPartners;
