-- Forum hashtag & @produk mention support (schema ForumPost.tags, productMentions)
ALTER TABLE `forum_posts` ADD COLUMN `tags` JSON NULL;
ALTER TABLE `forum_posts` ADD COLUMN `product_mentions` JSON NULL;
