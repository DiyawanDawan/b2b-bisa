import { z } from 'zod';

const forumMediaSchema = z.object({
  url: z
    .string()
    .min(1, 'URL media tidak valid')
    .refine(
      (v) => {
        try {
          // eslint-disable-next-line no-new
          new URL(v);
          return true;
        } catch {
          return v.startsWith('/');
        }
      },
      { message: 'URL media tidak valid' },
    ),
  type: z.enum(['image', 'video'], {
    required_error: 'Tipe media harus image atau video',
  }),
});

export const createPostSchema = z
  .object({
    title: z
      .string()
      .min(5, 'Judul diskusi minimal 5 karakter')
      .max(150, 'Judul diskusi maksimal 150 karakter'),
    content: z.string().max(5000, 'Konten terlalu panjang').optional().default(''),
    categoryId: z.string().uuid('Kategori ID tidak valid').optional(),
    groupId: z.string().uuid('Group ID tidak valid').optional(),
    mediaUrls: z.array(forumMediaSchema).max(10, 'Maksimal 10 media per posting').optional(),
    // Status saat dibuat: PUBLISHED langsung tayang, DRAFT disimpan untuk
    // diedit dulu. Default PUBLISHED demi backward-compat dengan mobile lama.
    status: z.enum(['PUBLISHED', 'DRAFT']).optional().default('PUBLISHED'),
    // Tag eksplisit (selain yang otomatis di-extract dari `#xxx` di content).
    // Maks 10 tag, masing-masing 2–40 karakter alfanumerik/strip/underscore.
    tags: z
      .array(z.string().min(1, 'Tag tidak boleh kosong').max(40, 'Tag terlalu panjang'))
      .max(10, 'Maksimal 10 tag per posting')
      .optional(),
  })
  .refine(
    (data) =>
      data.status === 'DRAFT' ||
      data.content.trim().length >= 10 ||
      (data.mediaUrls != null && data.mediaUrls.length > 0),
    { message: 'Isi diskusi minimal 10 karakter atau lampirkan media' },
  );

/**
 * Update post — semua field opsional, hanya field yang dikirim yang diupdate.
 * `status` dipakai untuk publish ulang draft, simpan kembali jadi draft,
 * atau arsipkan dari menu manajemen.
 */
export const updatePostSchema = z.object({
  title: z
    .string()
    .min(5, 'Judul diskusi minimal 5 karakter')
    .max(150, 'Judul diskusi maksimal 150 karakter')
    .optional(),
  content: z.string().max(5000, 'Konten terlalu panjang').optional(),
  categoryId: z.string().uuid('Kategori ID tidak valid').nullable().optional(),
  mediaUrls: z.array(forumMediaSchema).max(10, 'Maksimal 10 media per posting').optional(),
  status: z.enum(['PUBLISHED', 'DRAFT', 'ARCHIVED']).optional(),
  tags: z
    .array(z.string().min(1, 'Tag tidak boleh kosong').max(40, 'Tag terlalu panjang'))
    .max(10, 'Maksimal 10 tag per posting')
    .optional(),
});

/** Query pagination — terima string atau number (Express / Dio). */
const pageQuery = z.coerce.number().int().min(1).optional().default(1);
const limitQuery = z.coerce.number().int().min(1).max(100).optional().default(20);
const keywordQuery = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v == null) return undefined;
    const s = String(v).trim();
    return s.length > 0 ? s : undefined;
  });
const mineQuery = z
  .union([z.boolean(), z.string(), z.number()])
  .optional()
  .transform((v) => v === true || v === 'true' || v === '1' || v === 1);

export const listGroupsSchema = z.object({
  page: pageQuery,
  limit: limitQuery,
  keyword: keywordQuery,
  mine: mineQuery,
});

/** Kosong/null dari client → undefined agar optional URL tidak gagal min(1). */
const optionalMediaUrl = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().min(1, 'URL media tidak valid').optional(),
);

const optionalNullableMediaUrl = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().min(1, 'URL media tidak valid').nullable().optional(),
);

const optionalDescription = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().max(500, 'Deskripsi terlalu panjang').optional(),
);

const coerceBoolean = z.preprocess((v) => {
  if (v === 'true' || v === true) return true;
  if (v === 'false' || v === false) return false;
  return v;
}, z.boolean());

export const createGroupSchema = z.object({
  name: z.string().min(3, 'Nama grup minimal 3 karakter').max(80, 'Nama grup maksimal 80 karakter'),
  description: optionalDescription,
  avatarUrl: optionalMediaUrl,
  bannerUrl: optionalMediaUrl,
  isPublic: coerceBoolean.optional().default(true),
});

export const updateGroupSchema = z.object({
  name: z.string().min(3).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  avatarUrl: optionalNullableMediaUrl,
  bannerUrl: optionalNullableMediaUrl,
  isPublic: coerceBoolean.optional(),
});

/**
 * Query untuk endpoint "postingan saya": filter status opsional.
 */
export const myPostsSchema = z.object({
  page: pageQuery,
  limit: limitQuery,
  status: z.enum(['PUBLISHED', 'DRAFT', 'ARCHIVED']).optional(),
});

export const createCommentSchema = z
  .object({
    postId: z.string().uuid('Post ID tidak valid'),
    content: z.string().max(1000, 'Komentar terlalu panjang').optional().default(''),
    parentId: z.string().uuid('Parent ID tidak valid').optional(),
    mediaUrls: z.array(forumMediaSchema).max(4, 'Maksimal 4 media per komentar').optional(),
  })
  .refine(
    (data) =>
      data.content.trim().length >= 1 || (data.mediaUrls != null && data.mediaUrls.length > 0),
    { message: 'Komentar wajib berisi teks atau media' },
  );

export const voteSchema = z.object({
  targetId: z.string().uuid('Target ID tidak valid'),
  targetType: z.enum(['POST', 'COMMENT'], {
    required_error: 'Tipe target harus POST atau COMMENT',
  }),
  voteType: z.enum(['UP', 'DOWN'], { required_error: 'Tipe vote harus UP atau DOWN' }),
});

export const paginationSchema = z.object({
  page: pageQuery,
  limit: limitQuery,
  categoryId: z.string().uuid('Kategori ID tidak valid').optional(),
  keyword: keywordQuery,
  tag: z.string().max(40).optional(),
  groupId: z.string().uuid('Group ID tidak valid').optional(),
  sortBy: z.enum(['newest', 'popular', 'trending']).optional(),
});
