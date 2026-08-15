-- =============================================================================
--  Demo data, so a fresh clone shows a working site instead of an empty page.
--
--  All seed accounts share the password:   Password123!
--  These are throwaway demo accounts — the hashes below are for local use only.
--
--  Safe to re-run: INSERT IGNORE plus fixed ids means no duplicates.
-- =============================================================================

USE social_app;

INSERT IGNORE INTO users (id, email, password, name, bio, profile_picture) VALUES
  (1, 'dana@example.com',
      '$2b$12$YH7/sda0jQn.AARe2BbzIem0563T5rFpTclasNWmc91yHTc27CWdi',
      'Dana Levi', 'Frontend developer. Coffee first.',
      'https://api.dicebear.com/9.x/adventurer/svg?seed=Dana'),
  (2, 'omri@example.com',
      '$2b$12$h0w/OhG8NO2FUoojKZwpnunEYbRclVS.ZJYaJutbV4hg56Rc2RW0G',
      'Omri Cohen', 'Backend and databases. Ask me about indexes.',
      'https://api.dicebear.com/9.x/adventurer/svg?seed=Omri'),
  (3, 'maya@example.com',
      '$2b$12$9ecgb9EQQj74sCB4N2dHx.uN2MqwOEy81sSgiY6wFNx3mohLQph3u',
      'Maya Bar', 'Designer. I care about spacing more than you do.',
      'https://api.dicebear.com/9.x/adventurer/svg?seed=Maya');

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

INSERT IGNORE INTO follows (follower_id, following_id) VALUES
  (1, 2), (1, 3), (2, 1), (3, 1), (3, 2);
