
import React from 'react';
import Hero from '../components/Hero';
import Features from '../components/Features';
import VirtualDJDownload from '../components/VirtualDJDownload';
import AppPreview from '../components/AppPreview';
import ApparelShowcase from '../components/ApparelShowcase';
import BrandPartners from '../components/BrandPartners';
import HowItWorks from '../components/HowItWorks';
import Contact from '../components/Contact';
import Footer from '../components/Footer';

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#222240] via-[#3a3a6a] to-[#222240]">
      <Hero />
      <Features />
      <VirtualDJDownload />
      <AppPreview />
      <ApparelShowcase />
      <BrandPartners />
      <HowItWorks />
      <Contact />
      <Footer />
    </div>
  );
};

export default Index;
