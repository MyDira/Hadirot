export const getSiteUrl = () => {
  const url =
    import.meta?.env?.VITE_PUBLIC_SITE_URL ||
    window?.location?.origin ||
    'http://localhost:5173';
  // ensure no trailing slash
  return url.replace(new RegExp('/+$'), '');
};
