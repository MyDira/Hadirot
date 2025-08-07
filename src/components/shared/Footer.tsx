import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { footerService } from '../../services/footer';
import { FooterSection, FooterRichTextData, FooterLinkData } from '../../config/supabase';

export function Footer() {
  const location = useLocation();
  const [footerSections, setFooterSections] = useState<FooterSection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFooterSections = async () => {
      try {
        const sections = await footerService.getFooterSections();
        console.log('Fetched footer sections:', sections);
        setFooterSections(sections);
      } catch (error) {
        console.error('Error loading footer sections:', error);
      } finally {
        setLoading(false);
      }
    };

    loadFooterSections();
  }, [location.pathname]);

  const Logo = () => (
    <div className="flex items-center space-x-2">
      <div className="relative">
        <svg width="32" height="32" viewBox="0 0 32 32" className="text-[#F0E6D5]">
          <path
            d="M16 4L6 12v16h5v-8h10v8h5V12L16 4z"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinejoin="round"
          />
          <circle cx="23" cy="8" r="1" fill="currentColor" />
        </svg>
      </div>
      <span className="text-xl font-bold text-[#F0E6D5]">HaDirot</span>
    </div>
  );

  const mainInfoSection = footerSections.find(section => section.section_key === 'main_info');
  const mainInfoData = mainInfoSection?.content_data as FooterRichTextData;
  const linkSections = footerSections.filter(section =>
    section.section_key !== 'main_info' && section.content_type === 'links'
  );

  return (
    <footer className="bg-[#273140] text-[#F0E6D5] mt-auto">
      {/* Main Footer Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row justify-between items-start gap-8">
          {/* Left Section */}
          <div className="space-y-4">
            <Logo />
            {loading ? (
              <div className="space-y-2">
                <div className="h-6 bg-[#5A5651] rounded animate-pulse w-48 mb-2"></div>
                <div className="h-4 bg-[#5A5651] rounded animate-pulse w-full"></div>
                <div className="h-4 bg-[#5A5651] rounded animate-pulse w-5/6"></div>
              </div>
            ) : mainInfoData ? (
              <div className="space-y-2">
                <p className="text-lg font-medium text-white">{mainInfoData.tagline}</p>
                <p className="text-sm text-[#F0E6D5] opacity-90 max-w-md">{mainInfoData.description}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-lg font-medium text-white">NYC's Jewish rental platform</p>
                <p className="text-sm text-[#F0E6D5] opacity-90 max-w-md">
                  Helping tenants, landlords, and agents find the perfect match — no noise, just homes.
                </p>
              </div>
            )}
          </div>

          {/* Right Section */}
          <div className="flex flex-col md:flex-row gap-8 lg:gap-16">
            {loading ? (
              <>
                {[1, 2].map((_, i) => (
                  <div key={i} className="space-y-4">
                    <div className="h-6 bg-[#5A5651] rounded animate-pulse w-20"></div>
                    <div className="space-y-2">
                      <div className="h-4 bg-[#5A5651] rounded animate-pulse"></div>
                      <div className="h-4 bg-[#5A5651] rounded animate-pulse w-3/4"></div>
                      <div className="h-4 bg-[#5A5651] rounded animate-pulse w-1/2"></div>
                    </div>
                  </div>
                ))}
              </>
            ) : linkSections.length > 0 ? (
              linkSections.map(section => {
                const links = section.content_data as FooterLinkData[];
                return (
                  <div key={section.id} className="space-y-4">
                    <h3 className="text-lg font-semibold text-white">{section.title}</h3>
                    <nav className="space-y-2">
                      {links.map((link, index) => (
                        <Link
                          key={index}
                          to={link.url}
                          className="block text-[#F0E6D5] hover:text-white transition-colors duration-200"
                        >
                          {link.text}
                        </Link>
                      ))}
                    </nav>
                  </div>
                );
              })
            ) : (
              <>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Company</h3>
                  <nav className="space-y-2">
                    <Link to="/about" className="block text-[#F0E6D5] hover:text-white transition">
                      About Us
                    </Link>
                    <Link to="/contact" className="block text-[#F0E6D5] hover:text-white transition">
                      Contact
                    </Link>
                    <Link to="/privacy" className="block text-[#F0E6D5] hover:text-white transition">
                      Privacy Policy
                    </Link>
                    <Link to="/terms" className="block text-[#F0E6D5] hover:text-white transition">
                      Terms of Use
                    </Link>
                  </nav>
                </div>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Explore</h3>
                  <nav className="space-y-2">
                    <Link to="/browse" className="block text-[#F0E6D5] hover:text-white transition">
                      Browse Listings
                    </Link>
                    <Link to="/browse?featured=true" className="block text-[#F0E6D5] hover:text-white transition">
                      Featured Listings
                    </Link>
                    <Link to="/post" className="block text-[#F0E6D5] hover:text-white transition">
                      Post a Listing
                    </Link>
                  </nav>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Footer Bar */}
      <div className="border-t border-[#3a4553] bg-[#1e252f]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row justify-between items-center space-y-2 sm:space-y-0">
            <p className="text-sm text-[#F0E6D5] opacity-75">
              © 2025 HaDirot. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
