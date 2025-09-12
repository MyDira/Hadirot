import React from 'react';
import { Link } from 'react-router-dom';

export function NotFound({ message = 'Page not found' }: { message?: string }) {
  return (
    <div className="max-w-3xl mx-auto p-6 text-center">
      <h1 className="text-2xl font-bold mb-4">{message}</h1>
      <Link to="/" className="text-brand-700 underline">Go home</Link>
    </div>
  );
}

