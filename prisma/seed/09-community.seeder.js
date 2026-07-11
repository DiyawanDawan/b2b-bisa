import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';
import { loremFlickrDbPath } from '../../src/utils/loremFlickrMedia.util.ts';

const seedForumMedia = (keywords, lock) => [
  {
    url: loremFlickrDbPath(keywords, { lock }),
    type: 'image',
  },
];

export async function seedCommunity(prisma, users) {
  logger.info('🌱 [09] Seeding Full Community Content (10+ Data)...');

  const hasForumGroups = typeof prisma.forumGroup?.findMany === 'function';

  await prisma.article.deleteMany({});
  await prisma.forumPost.deleteMany({});

  const { admin, allSuppliers, allBuyers } = users;
  if (!admin || !allSuppliers || allSuppliers.length === 0) return;

  const articleCat = await prisma.category.findFirst({ where: { categoryType: 'ARTICLE' } });
  const forumCat = await prisma.category.findFirst({ where: { categoryType: 'FORUM' } });

  const communityUsers = [admin, ...allSuppliers, ...allBuyers];

  const groups = hasForumGroups
    ? await prisma.forumGroup.findMany({ orderBy: { createdAt: 'asc' } })
    : [];

  if (hasForumGroups && groups.length === 0) {
    logger.warn(
      '⚠️ [09] Belum ada forum group di DB. Jalankan seedForumGroups (09-forum-groups) terlebih dahulu.',
    );
  }

  // 10 Articles
  for (let i = 0; i < 10; i++) {
    await prisma.article.create({
      data: {
        title: faker.lorem.sentence(6),
        content: faker.lorem.paragraphs(3),
        imageUrl: loremFlickrDbPath(['agriculture', 'farm'], { lock: i + 1 }),
        categoryId: articleCat?.id,
        authorId: admin.id,
        status: faker.helpers.arrayElement(['PUBLISHED', 'DRAFT', 'ARCHIVED']),
        publishedAt: new Date(),
      },
    });
  }

  // 10 Forum Posts with Comments and Votes
  for (let i = 0; i < 10; i++) {
    const postUser = faker.helpers.arrayElement(communityUsers);

    const post = await prisma.forumPost.create({
      data: {
        title: faker.lorem.sentence(5),
        content: faker.lorem.paragraph(),
        categoryId: forumCat?.id,
        userId: postUser.id,
        mediaUrls: faker.datatype.boolean(0.65)
          ? seedForumMedia(['farmer', 'agriculture', 'forum'], 9000 + i)
          : undefined,
        status: 'PUBLISHED',
        upvotes: faker.number.int({ min: 0, max: 100 }),
        viewCount: faker.number.int({ min: 10, max: 1000 }),
      },
    });

    // 2-3 Comments per post (+ optional replies)
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
            ? seedForumMedia(['discussion', 'community'], 9100 + i * 10 + c)
            : undefined,
          upvotes: faker.number.int({ min: 0, max: 20 }),
        },
      });
      topComments.push(comment);

      // 1 vote per comment
      const voteUser = faker.helpers.arrayElement(communityUsers);
      await prisma.forumVote.create({
        data: {
          commentId: comment.id,
          userId: voteUser.id,
          type: faker.helpers.arrayElement(['UP', 'DOWN']),
        },
      });
    }

    // 1-2 balasan untuk komentar pertama (thread seperti Facebook)
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

    // 2 votes per post
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

  // 12 Forum Posts in Groups
  if (hasForumGroups && groups.length > 0) {
    for (let i = 0; i < 12; i++) {
      const group = faker.helpers.arrayElement(groups);
      const groupMembers = await prisma.forumGroupMember.findMany({
        where: { groupId: group.id },
        select: { userId: true },
      });
      const posterId = faker.helpers.arrayElement(groupMembers).userId;

      const post = await prisma.forumPost.create({
        data: {
          title: faker.helpers.arrayElement([
            'Tips optimasi suhu tungku untuk grade A',
            'Checklist harian sebelum start produksi',
            'Diskusi pengiriman batch mingguan',
            'Troubleshooting sensor suhu yang tidak stabil',
            'Skema QA untuk batch biochar ekspor',
          ]),
          content: faker.lorem.paragraphs(2),
          categoryId: forumCat?.id,
          groupId: group.id,
          userId: posterId,
          mediaUrls: faker.datatype.boolean(0.75)
            ? seedForumMedia(['biochar', 'iot', 'warehouse'], 9200 + i)
            : undefined,
          status: 'PUBLISHED',
          upvotes: faker.number.int({ min: 0, max: 80 }),
          viewCount: faker.number.int({ min: 20, max: 700 }),
        },
      });

      const commentCount = faker.number.int({ min: 2, max: 5 });
      for (let c = 0; c < commentCount; c++) {
        const commenterId = faker.helpers.arrayElement(groupMembers).userId;
        const comment = await prisma.forumComment.create({
          data: {
            postId: post.id,
            userId: commenterId,
            content: faker.lorem.sentences(2),
            mediaUrls: faker.datatype.boolean(0.4)
              ? seedForumMedia(['group', 'forum'], 9300 + i * 10 + c)
              : undefined,
            upvotes: faker.number.int({ min: 0, max: 15 }),
          },
        });

        const voterId = faker.helpers.arrayElement(groupMembers).userId;
        await prisma.forumVote.upsert({
          where: { userId_commentId: { userId: voterId, commentId: comment.id } },
          update: {},
          create: {
            commentId: comment.id,
            userId: voterId,
            type: faker.helpers.arrayElement(['UP', 'DOWN']),
          },
        });
      }
    }
  }

  logger.info(
    '✅ [09] Community content seeded (articles, global forum, forum groups, group posts).',
  );
}
