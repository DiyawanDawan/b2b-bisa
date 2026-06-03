import prisma from '#config/prisma';
import { ProductStatus } from '#prisma';

/**
 * Util untuk parsing konten forum:
 * - Hashtag `#kata` → array of tag string (lowercase, deduped)
 * - Mention `@nama-produk` → array of token kandidat, di-resolve ke produk
 *   via fuzzy name match (token "biochar-kelas-a" → cocokkan dengan
 *   product.name yang mengandung "biochar kelas a").
 *
 * Kenapa pakai parser di server bukan di client?
 * - Konsistensi: snapshot tag/produk tersimpan di DB jadi sumber kebenaran.
 * - Hashtag bisa langsung di-index untuk filter/trending tanpa parse ulang.
 * - Resolusi `@product` ke ID asli aman karena tidak bisa di-spoof client.
 */

// Hashtag: huruf, angka, garis bawah / strip. Min 2 char supaya tidak
// terlalu noisy (mis. "#a" tidak dianggap tag).
const HASHTAG_RE = /(?:^|\s)#([a-zA-Z0-9_-]{2,40})/g;

// Mention: token yang sama, max 60 char karena nama produk bisa panjang.
const MENTION_RE = /(?:^|\s)@([a-zA-Z0-9_-]{2,60})/g;

export interface ForumProductMention {
  id: string;
  name: string;
  slug: string; // bentuk slug dari token mention (untuk render @slug di UI)
}

export const extractHashtags = (content: string): string[] => {
  if (!content) return [];
  const tags = new Set<string>();
  let match: RegExpExecArray | null;
  HASHTAG_RE.lastIndex = 0;
  while ((match = HASHTAG_RE.exec(content)) !== null) {
    tags.add(match[1].toLowerCase());
  }
  return [...tags];
};

export const extractMentionTokens = (content: string): string[] => {
  if (!content) return [];
  const tokens = new Set<string>();
  let match: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((match = MENTION_RE.exec(content)) !== null) {
    tokens.add(match[1].toLowerCase());
  }
  return [...tokens];
};

/**
 * Normalisasi tags eksplisit (dari body request) + dedup dengan extracted.
 * Membersihkan prefix '#', lowercase, dan filter karakter aneh.
 */
export const mergeTags = (explicit: string[] | undefined, contentTags: string[]): string[] => {
  const all = new Set<string>(contentTags);
  for (const raw of explicit ?? []) {
    const cleaned = raw
      .trim()
      .replace(/^#/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
    if (cleaned.length >= 2 && cleaned.length <= 40) {
      all.add(cleaned);
    }
  }
  // Limit 10 tags supaya tidak abuse.
  return [...all].slice(0, 10);
};

/**
 * Resolve token `@xxx` menjadi produk asli. Mengembalikan max 5 hasil.
 *
 * Strategi:
 * 1. Bangun kandidat search query: ganti `-`/`_` jadi spasi.
 * 2. Cari produk ACTIVE yang `name` LIKE %query% (case-insensitive di MySQL
 *    karena default collation utf8mb4_unicode_ci sudah CI).
 * 3. Ambil 1 hit terbaik per token (paling dekat panjangnya).
 */
export const resolveProductMentions = async (tokens: string[]): Promise<ForumProductMention[]> => {
  if (tokens.length === 0) return [];

  const results: ForumProductMention[] = [];
  const seenIds = new Set<string>();

  for (const token of tokens.slice(0, 10)) {
    const query = token.replace(/[-_]+/g, ' ').trim();
    if (!query) continue;

    const matches = await prisma.product.findMany({
      where: {
        status: ProductStatus.ACTIVE,
        name: { contains: query },
      },
      select: { id: true, name: true },
      take: 3,
    });

    if (matches.length === 0) continue;

    // Pilih nama dengan panjang paling dekat dengan token query (relevance proxy).
    const best = matches.sort(
      (a, b) => Math.abs(a.name.length - query.length) - Math.abs(b.name.length - query.length),
    )[0];

    if (seenIds.has(best.id)) continue;
    seenIds.add(best.id);
    results.push({ id: best.id, name: best.name, slug: token });

    if (results.length >= 5) break;
  }

  return results;
};

/**
 * One-shot helper untuk service: parse konten + merge tag eksplisit +
 * resolve produk. Mengembalikan payload yang siap disimpan ke DB.
 */
export const buildForumMetadata = async (params: {
  content: string;
  explicitTags?: string[];
}): Promise<{
  tags: string[];
  productMentions: ForumProductMention[];
}> => {
  const contentTags = extractHashtags(params.content);
  const tags = mergeTags(params.explicitTags, contentTags);
  const mentionTokens = extractMentionTokens(params.content);
  const productMentions = await resolveProductMentions(mentionTokens);
  return { tags, productMentions };
};
