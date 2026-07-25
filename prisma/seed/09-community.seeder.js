import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';
import { loremFlickrDbPath } from '../../src/utils/loremFlickrMedia.util.ts';
import { seedForumGroupPosts } from './09-forum-group-posts.seeder.js';

const seedForumMedia = (keywords, lock) => [
  {
    url: loremFlickrDbPath(keywords, { lock }),
    type: 'image',
  },
];

function htmlParagraphs(...parts) {
  return parts.map((p) => `<p>${p}</p>`).join('');
}

function htmlArticleBody(topic) {
  return [
    `<p><strong>${topic}</strong> — konten demo seed dengan format HTML (kompatibel Quill).</p>`,
    `<h3>Ringkasan</h3>`,
    `<p>${faker.lorem.paragraph()}</p>`,
    `<ul><li>Poin praktik lapangan</li><li>Referensi regulasi / standar</li><li>Langkah implementasi di platform BISA</li></ul>`,
    `<p>${faker.lorem.paragraph()}</p>`,
  ].join('');
}

function htmlForumBody(titleHint) {
  return [
    `<p>Halo komunitas — diskusi tentang <strong>${titleHint}</strong>.</p>`,
    `<h3>Konteks</h3>`,
    `<p>${faker.lorem.sentences(2)}</p>`,
    `<ul><li>Pengalaman lapangan</li><li>Saran teknis</li><li>Link ke produk relevan di marketplace</li></ul>`,
    `<p>Tag &amp; mention demo seed. #biomassa #organik</p>`,
  ].join('');
}

export async function seedCommunity(prisma, users) {
  logger.info('🌱 [09] Seeding Full Community Content (10+ Data)...');

  const hasForumGroups = typeof prisma.forumGroup?.findMany === 'function';

  await prisma.article.deleteMany({});
  await prisma.forumPost.deleteMany({});

  const { admin, allSuppliers, allBuyers } = users;
  if (!admin || !allSuppliers || allSuppliers.length === 0) return;

  const articleCats = await prisma.category.findMany({
    where: { categoryType: 'ARTICLE', isActive: true },
    orderBy: { name: 'asc' },
  });
  const forumCats = await prisma.category.findMany({
    where: { categoryType: 'FORUM', isActive: true },
    orderBy: { name: 'asc' },
  });

  const communityUsers = [admin, ...allSuppliers, ...allBuyers];

  const groups = hasForumGroups
    ? await prisma.forumGroup.findMany({ orderBy: { createdAt: 'asc' } })
    : [];

  if (hasForumGroups && groups.length === 0) {
    logger.warn(
      '⚠️ [09] Belum ada forum group di DB. Jalankan seedForumGroups (09-forum-groups) terlebih dahulu.',
    );
  }

  const mentionProduct = await prisma.product.findFirst({
    where: { status: 'ACTIVE', name: { contains: 'Demo' } },
    select: { id: true, name: true },
  });
  const productMentions = mentionProduct
    ? [{ id: mentionProduct.id, name: mentionProduct.name, slug: mentionProduct.id }]
    : undefined;

  // Deterministic articles spanning all ARTICLE categories + PostStatus
  const articleFixtures = [
    {
      title: '[SEED] Berita Karbon: Harga kredit naik di Q2',
      topic: 'Berita Karbon',
      catName: 'Berita Karbon',
      status: 'PUBLISHED',
      publishedAt: new Date(Date.now() - 3 * 86400000),
    },
    {
      title: '[SEED] Draft Regulasi Pemerintah — belum dipublish',
      topic: 'Regulasi Pemerintah',
      catName: 'Regulasi Pemerintah',
      status: 'DRAFT',
      publishedAt: null,
    },
    {
      title: '[SEED] Inovasi Pertanian (arsip) — hidroponik biochar',
      topic: 'Inovasi Pertanian',
      catName: 'Inovasi Pertanian',
      status: 'ARCHIVED',
      publishedAt: new Date(Date.now() - 90 * 86400000),
    },
    {
      title: '[SEED] Update pasar karbon Indonesia',
      topic: 'Berita Karbon',
      catName: 'Berita Karbon',
      status: 'PUBLISHED',
      publishedAt: new Date(Date.now() - 1 * 86400000),
    },
    {
      title: '[SEED] Draft inovasi sensor IoT lahan',
      topic: 'Inovasi Pertanian',
      catName: 'Inovasi Pertanian',
      status: 'DRAFT',
      publishedAt: null,
    },
    {
      title: '[SEED] Arsip regulasi emisi biomassa 2024',
      topic: 'Regulasi Pemerintah',
      catName: 'Regulasi Pemerintah',
      status: 'ARCHIVED',
      publishedAt: new Date(Date.now() - 120 * 86400000),
    },
  ];

  for (let i = 0; i < articleFixtures.length; i++) {
    const fix = articleFixtures[i];
    const cat =
      articleCats.find((c) => c.name === fix.catName) ??
      articleCats[i % Math.max(articleCats.length, 1)];
    await prisma.article.create({
      data: {
        title: fix.title,
        content: htmlArticleBody(fix.topic),
        imageUrl: loremFlickrDbPath(['agriculture', 'farm'], { lock: i + 1 }),
        categoryId: cat?.id ?? null,
        authorId: admin.id,
        status: fix.status,
        publishedAt: fix.publishedAt,
      },
    });
  }

  // Extra articles rotating categories (mixed statuses, correct publishedAt)
  for (let i = 0; i < 6; i++) {
    const status = ['PUBLISHED', 'DRAFT', 'ARCHIVED'][i % 3];
    const cat = articleCats[i % Math.max(articleCats.length, 1)];
    await prisma.article.create({
      data: {
        title: `[SEED] Artikel ${i + 1}: ${faker.lorem.words(5)}`,
        content: htmlArticleBody(cat?.name ?? 'Artikel'),
        imageUrl: loremFlickrDbPath(['agriculture', 'farm'], { lock: 20 + i }),
        categoryId: cat?.id ?? null,
        authorId: admin.id,
        status,
        publishedAt: status === 'DRAFT' ? null : faker.date.recent({ days: 60 }),
      },
    });
  }

  // Deterministic global forum posts: all FORUM cats + PostStatus + rich HTML
  const forumFixtures = [
    {
      title: '[SEED] Teknologi Pirolisis — tips suhu kiln',
      catName: 'Teknologi Pirolisis',
      status: 'PUBLISHED',
      tags: ['pirolisis', 'kiln', 'biochar'],
    },
    {
      title: '[SEED] Supply Chain — draft rute logistik',
      catName: 'Supply Chain',
      status: 'DRAFT',
      tags: ['logistik', 'supply-chain'],
    },
    {
      title: '[SEED] Tanya Jawab Petani — arsip QnA pupuk',
      catName: 'Tanya Jawab Petani',
      status: 'ARCHIVED',
      tags: ['qna', 'petani'],
    },
    {
      title: '[SEED] Supply Chain published — cold chain sayur',
      catName: 'Supply Chain',
      status: 'PUBLISHED',
      tags: ['cold-chain', 'organik'],
    },
    {
      title: '[SEED] Pirolisis draft SOP batch',
      catName: 'Teknologi Pirolisis',
      status: 'DRAFT',
      tags: ['sop', 'batch'],
    },
    {
      title: '[SEED] Tanya Jawab published — booking panen',
      catName: 'Tanya Jawab Petani',
      status: 'PUBLISHED',
      tags: ['booking', 'panen'],
    },
  ];

  for (let i = 0; i < forumFixtures.length; i++) {
    const fix = forumFixtures[i];
    const cat =
      forumCats.find((c) => c.name === fix.catName) ?? forumCats[i % Math.max(forumCats.length, 1)];
    const postUser = communityUsers[i % communityUsers.length];

    const post = await prisma.forumPost.create({
      data: {
        title: fix.title,
        content: htmlForumBody(fix.catName),
        categoryId: cat?.id ?? null,
        userId: postUser.id,
        mediaUrls: seedForumMedia(['farmer', 'agriculture', 'forum'], 9000 + i),
        status: fix.status,
        tags: fix.tags,
        productMentions: fix.status === 'PUBLISHED' ? productMentions : undefined,
        upvotes: faker.number.int({ min: 0, max: 80 }),
        viewCount: faker.number.int({ min: 10, max: 800 }),
      },
    });

    if (fix.status === 'PUBLISHED') {
      const commentUser = communityUsers[(i + 1) % communityUsers.length];
      await prisma.forumComment.create({
        data: {
          postId: post.id,
          userId: commentUser.id,
          content: htmlParagraphs('Komentar demo seed dengan <strong>HTML ringan</strong>.'),
        },
      });
    }
  }

  // Extra random-ish forum posts rotating categories/statuses
  for (let i = 0; i < 8; i++) {
    const postUser = faker.helpers.arrayElement(communityUsers);
    const cat = forumCats[i % Math.max(forumCats.length, 1)];
    const status = ['PUBLISHED', 'DRAFT', 'ARCHIVED', 'PUBLISHED'][i % 4];

    const post = await prisma.forumPost.create({
      data: {
        title: `[SEED] Forum ${i + 1}: ${faker.lorem.sentence(5)}`,
        content: htmlForumBody(cat?.name ?? 'Forum'),
        categoryId: cat?.id ?? null,
        userId: postUser.id,
        mediaUrls: faker.datatype.boolean(0.65)
          ? seedForumMedia(['farmer', 'agriculture', 'forum'], 9100 + i)
          : undefined,
        status,
        tags: ['seed', cat?.name?.toLowerCase().replace(/\s+/g, '-') ?? 'forum'],
        upvotes: faker.number.int({ min: 0, max: 100 }),
        viewCount: faker.number.int({ min: 10, max: 1000 }),
      },
    });

    if (status !== 'PUBLISHED') continue;

    const commentCount = faker.number.int({ min: 2, max: 4 });
    const topComments = [];
    for (let c = 0; c < commentCount; c++) {
      const commentUser = faker.helpers.arrayElement(communityUsers);
      const comment = await prisma.forumComment.create({
        data: {
          postId: post.id,
          userId: commentUser.id,
          content: faker.lorem.sentences(2),
          mediaUrls: faker.datatype.boolean(0.35)
            ? seedForumMedia(['discussion', 'community'], 9200 + i * 10 + c)
            : undefined,
          upvotes: faker.number.int({ min: 0, max: 20 }),
        },
      });
      topComments.push(comment);

      const voteUser = faker.helpers.arrayElement(communityUsers);
      await prisma.forumVote.create({
        data: {
          commentId: comment.id,
          userId: voteUser.id,
          type: faker.helpers.arrayElement(['UP', 'DOWN']),
        },
      });
    }

    if (topComments.length > 0 && faker.datatype.boolean(0.7)) {
      const parent = topComments[0];
      const replyCount = faker.number.int({ min: 1, max: 2 });
      for (let r = 0; r < replyCount; r++) {
        const replyUser = faker.helpers.arrayElement(communityUsers);
        const reply = await prisma.forumComment.create({
          data: {
            postId: post.id,
            parentId: parent.id,
            userId: replyUser.id,
            content: faker.lorem.sentence(),
            upvotes: faker.number.int({ min: 0, max: 10 }),
          },
        });
        const replyVoter = faker.helpers.arrayElement(communityUsers);
        await prisma.forumVote.create({
          data: {
            commentId: reply.id,
            userId: replyVoter.id,
            type: 'UP',
          },
        });
      }
    }

    for (let v = 0; v < 2; v++) {
      const voteUser = faker.helpers.arrayElement(communityUsers);
      await prisma.forumVote.upsert({
        where: { userId_postId: { userId: voteUser.id, postId: post.id } },
        update: {},
        create: {
          postId: post.id,
          userId: voteUser.id,
          type: faker.helpers.arrayElement(['UP', 'DOWN']),
        },
      });
    }
  }

  // Postingan + komentar per grup (template QA deterministik)
  if (hasForumGroups && groups.length > 0) {
    await seedForumGroupPosts(prisma);
  }

  logger.info(
    '✅ [09] Community content seeded (articles, global forum, forum groups, group posts).',
  );
}
