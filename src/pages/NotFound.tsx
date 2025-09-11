import React from 'react';
import { Link } from 'react-router-dom';

interface NotFoundProps {
  message?: string;
}

export function NotFound({ message }: NotFoundProps) {
  return (
    <div className="max-w-3xl mx-auto p-6 text-center">
      <h1 className="text-2xl font-bold mb-4">{message ?? 'Page not found'}</h1>
      <Link to="/" className="text-brand-700 underline">
        Go home
      </Link>
    </div>
  );
}
