import React from 'react';
import { Link } from 'react-router-dom';
import * as Icons from 'lucide-react';
import { HeroBanner } from '../../config/supabase';

interface BannerProps {
  banner: HeroBanner;
}

export function Banner({ banner }: BannerProps) {
  const getIcon = (iconName?: string) => {
    if (!iconName) return null;
    const Icon = (Icons as any)[iconName];
    return Icon ? <Icon className="w-6 h-6" /> : null;
  };

  const getButtonClasses = (style: string) => {
    switch (style) {
      case 'primary':
        return 'bg-accent-500 text-white hover:bg-accent-600 focus:ring-accent-400';
      case 'secondary':
        return 'border border-accent-500 text-accent-600 hover:bg-accent-500 hover:text-white focus:ring-accent-400';
      case 'outline':
        return 'border-2 border-white text-white hover:bg-white hover:text-brand-700 focus:ring-white';
      default:
        return 'bg-accent-500 text-white hover:bg-accent-600 focus:ring-accent-400';
    }
  };

  const textColorClass = banner.text_color === 'dark' ? 'text-gray-900' : 'text-white';
  const subheadingColorClass = banner.text_color === 'dark' ? 'text-gray-700' : 'text-white/90';

  return (
    <section
      className="text-center py-20"
      style={{ backgroundColor: banner.background_color }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className={`text-3xl md:text-5xl font-semibold font-brand ${textColorClass} mb-6`}>
          {banner.heading}
        </h1>
        {banner.subheading && (
          <p className={`text-2xl md:text-3xl ${subheadingColorClass} mb-8 max-w-2xl mx-auto`}>
            {banner.subheading}
          </p>
        )}
        {banner.buttons && banner.buttons.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {banner.buttons.map((button) => {
              const icon = getIcon(button.icon_name);
              const buttonClasses = getButtonClasses(button.button_style);

              return (
                <Link
                  key={button.id}
                  to={button.button_url}
                  className={`inline-flex items-center justify-center px-8 py-4 rounded-lg text-lg font-medium focus:outline-none focus:ring-2 transition-colors ${buttonClasses}`}
                >
                  {icon && <span className="mr-2">{icon}</span>}
                  {button.button_text}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
