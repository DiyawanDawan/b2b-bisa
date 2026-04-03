import logger from '../../src/config/logger.js';
import { faker } from '@faker-js/faker/locale/id_ID';

export async function seedCommunity(prisma, users) {
  logger.info('🌱 [09] Seeding Full Community Content (10+ Data)...');

  await prisma.article.deleteMany({});
  await prisma.forumPost.deleteMany({});

  const { admin, allSuppliers, allBuyers } = users;
  if (!admin || !allSuppliers || allSuppliers.length === 0) return;

  const articleCat = await prisma.category.findFirst({ where: { categoryType: 'ARTICLE' } });
  const forumCat = await prisma.category.findFirst({ where: { categoryType: 'FORUM' } });

  const communityUsers = [admin, ...allSuppliers, ...allBuyers];

  // 10 Articles
  for (let i = 0; i < 10; i++) {
    await prisma.article.create({
      data: {
        title: faker.lorem.sentence(6),
        content: faker.lorem.paragraphs(3),
        imageUrl: faker.image.urlLoremFlickr({ category: 'nature', width: 640, height: 480 }),
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
        status: 'PUBLISHED',
        upvotes: faker.number.int({ min: 0, max: 100 }),
        viewCount: faker.number.int({ min: 10, max: 1000 }),
      },
    });

    // 2-3 Comments per post
    const commentCount = faker.number.int({ min: 2, max: 4 });
    for (let c = 0; c < commentCount; c++) {
      const commentUser = faker.helpers.arrayElement(communityUsers);
      const comment = await prisma.forumComment.create({
        data: {
          postId: post.id,
          userId: commentUser.id,
          content: faker.lorem.sentences(2),
          upvotes: faker.number.int({ min: 0, max: 20 }),
        },
      });

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

  console.log('✅ [09] 10+ Community Content seeded.');
}
