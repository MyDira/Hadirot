import DOMPurify from 'dompurify';

/**
 * Sanitizes HTML content to prevent XSS attacks
 * @param html - The HTML string to sanitize
 * @returns Sanitized HTML string safe for rendering
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  
  // Configure DOMPurify to allow common formatting elements
  const config = {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'a', 'blockquote',
      'code', 'pre'
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'class'
    ],
    // Ensure links open safely
    ADD_ATTR: ['target', 'rel'],
    FORBID_ATTR: ['style', 'onclick', 'onload', 'onerror'],
    // Remove any script tags or event handlers
    FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
  };

  return DOMPurify.sanitize(html, config);
}