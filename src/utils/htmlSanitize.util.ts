import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'sub',
  'sup',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'img',
  'a',
  'span',
  'div',
];

/**
 * Sanitize product / forum description HTML for storage / display.
 * Plain text (no tags) is returned as-is (wrapped callers may treat as plain).
 */
export const sanitizeProductDescriptionHtml = (input?: string | null): string | undefined => {
  if (input == null) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  return sanitizeHtml(trimmed, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      '*': ['class', 'style', 'data-list'],
    },
    allowedClasses: {
      '*': [
        'ql-align-center',
        'ql-align-justify',
        'ql-align-right',
        'ql-direction-rtl',
        'ql-font-monospace',
        'ql-font-serif',
        'ql-indent-1',
        'ql-indent-2',
        'ql-indent-3',
        'ql-indent-4',
        'ql-indent-5',
        'ql-indent-6',
        'ql-indent-7',
        'ql-indent-8',
        'ql-size-huge',
        'ql-size-large',
        'ql-size-small',
        'ql-ui',
      ],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
    },
    allowedStyles: {
      '*': {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb(a)?\([\d\s,.%]+\)$/i],
        'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgb(a)?\([\d\s,.%]+\)$/i],
        'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
      },
    },
  });
};

/** Strip tags for previews, validation length, and hashtag parsing. */
export const stripHtmlToPlain = (input?: string | null): string => {
  if (input == null) return '';
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
};
