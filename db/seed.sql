-- =============================================================================
--  Demo data, so a fresh clone shows a working site instead of an empty page.
--
--  All seed accounts share the password:   Password123!
--  These are throwaway demo accounts — the hashes below are for local use only.
--
--  Safe to re-run and safe on a database that already holds your own data:
--  every statement is INSERT IGNORE with fixed ids, so nothing is duplicated
--  and nothing of yours is overwritten.
-- =============================================================================

USE social_app;

-- --------------------------------------------------------------- people -----
INSERT IGNORE INTO users (id, email, password, name, bio, profile_picture, role) VALUES
  (1, 'dana@example.com',
      '$2b$12$YH7/sda0jQn.AARe2BbzIem0563T5rFpTclasNWmc91yHTc27CWdi',
      'Dana Levi', 'Frontend developer. Coffee first.',
      'https://api.dicebear.com/9.x/adventurer/svg?seed=Dana', 'user'),
  (2, 'omri@example.com',
      '$2b$12$h0w/OhG8NO2FUoojKZwpnunEYbRclVS.ZJYaJutbV4hg56Rc2RW0G',
      'Omri Cohen', 'Backend and databases. Ask me about indexes.',
      'https://api.dicebear.com/9.x/adventurer/svg?seed=Omri', 'user'),
  (3, 'maya@example.com',
      '$2b$12$9ecgb9EQQj74sCB4N2dHx.uN2MqwOEy81sSgiY6wFNx3mohLQph3u',
      'Maya Bar', 'Designer. I care about spacing more than you do.',
      'https://api.dicebear.com/9.x/adventurer/svg?seed=Maya', 'user');

-- An admin account, so the moderation dashboard built in a later phase has
-- someone to sign in as. Same demo password.
INSERT IGNORE INTO users (id, email, password, name, bio, profile_picture, role) VALUES
  (4, 'admin@example.com',
      '$2b$12$YH7/sda0jQn.AARe2BbzIem0563T5rFpTclasNWmc91yHTc27CWdi',
      'Site Admin', 'Keeps the place tidy.',
      'https://api.dicebear.com/9.x/adventurer/svg?seed=Admin', 'admin');

-- ---------------------------------------------------------------- posts -----
INSERT IGNORE INTO posts (id, user_id, title, body, image_url) VALUES
  (1, 1, 'Hello world',
      '<p>First post on the platform. Trying out the <strong>rich text editor</strong>.</p>', NULL),
  (2, 2, 'On database indexes',
      '<p>An index is a trade: <em>faster reads</em>, slower writes, more disk. Worth it for a feed.</p>', NULL),
  (3, 3, 'Spacing is a feature',
      '<p>Consistent spacing does more for readability than any font choice.</p><ul><li>Pick a scale</li><li>Stick to it</li></ul>', NULL),
  (4, 1, 'Testing the feed',
      '<p>Scrolling down should load more posts automatically.</p>', NULL),
  (5, 2, 'Why we hash passwords',
      '<p>Storing a password in plaintext means one leak compromises every account. bcrypt makes each guess expensive.</p>', NULL);

-- -------------------------------------------------------------- follows -----
INSERT IGNORE INTO follows (follower_id, following_id) VALUES
  (1, 2), (1, 3), (2, 1), (3, 1), (3, 2);

-- ---------------------------------------------------------------- likes -----
INSERT IGNORE INTO likes (user_id, post_id) VALUES
  (1, 2), (1, 3), (2, 1), (3, 1), (3, 2), (2, 5);

-- ------------------------------------------------------------- comments -----
-- Ids 1 and 2 are top-level; 3 is a reply to 1, which exercises parent_id.
INSERT IGNORE INTO comments (id, post_id, user_id, parent_id, body) VALUES
  (1, 2, 1, NULL, 'This finally made indexes click for me.'),
  (2, 3, 2, NULL, 'Agreed. Spacing beats font choice every time.'),
  (3, 2, 2, 1,    'Glad it helped — the write cost is the part people forget.');
