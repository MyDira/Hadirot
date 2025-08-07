import React, { useState, useEffect } from 'react';
import { staticPagesService, StaticPage } from '../services/staticPages';
import { sanitizeHtml } from '../utils/sanitize';

export function Contact() {
  const [pageData, setPageData] = useState<StaticPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPageData = async () => {
      try {
        const data = await staticPagesService.getStaticPage('contact');
        setPageData(data);
      } catch (error) {
        console.error('Error loading contact page:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPageData();
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140] mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  if (!pageData) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <p className="text-gray-600">Page not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-[#273140] mb-4">
          {pageData.title}
        </h1>
        <p className="text-xl text-gray-600">
          We're here to help you with all your rental needs
        </p>
      </div>

      <div 
        className="prose prose-lg max-w-none text-gray-700 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-[#273140] [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[#273140] [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-[#273140] [&_h3]:mb-2 [&_a]:text-[#273140] [&_a]:underline hover:[&_a]:text-[#1e252f] [&_ul]:list-disc [&_ul]:list-inside [&_ol]:list-decimal [&_ol]:list-inside [&_li]:mb-1"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(pageData.content) }}
      />
    </div>
  );
}