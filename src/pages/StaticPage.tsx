import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { staticPagesService } from '@/services/staticPages';
import { NotFound } from './NotFound';

type Params = { id?: string };

export function StaticPage() {
  const { id } = useParams<Params>();
  const [page, setPage] = useState<{ id: string; title: string; content: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      const data = await staticPagesService.getStaticPage(id);
      if (mounted) {
        setPage(data);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (!page) return <NotFound message="Page not found" />;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">{page.title}</h1>
      <div className="prose" dangerouslySetInnerHTML={{ __html: page.content }} />
    </div>
  );
}

