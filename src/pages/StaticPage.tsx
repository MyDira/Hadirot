import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { staticPagesService, StaticPage as StaticPageData } from '../services/staticPages';
import { NotFound } from './NotFound';

type Params = {
  slug?: string;
};

export function StaticPage() {
  const { slug } = useParams<Params>();
  const [page, setPage] = useState<StaticPageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPage = async () => {
      if (!slug) return;
      const data = await staticPagesService.getStaticPage(slug);
      setPage(data);
      setLoading(false);
    };
    loadPage();
  }, [slug]);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!page) {
    return <NotFound message="Page not found" />;
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">{page.title}</h1>
      <div
        className="prose"
        dangerouslySetInnerHTML={{ __html: page.content }}
      />
    </div>
  );
}
