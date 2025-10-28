import React from 'react';
import { StaticPageEditor } from '@/pages/admin/StaticPageEditor';

export default function StaticPagesTab() {
  return (
    <div className="mt-6">
      <StaticPageEditor showHeader={false} />
    </div>
  );
}
