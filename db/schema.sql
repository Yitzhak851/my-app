-- =============================================================================
--  YBO Social Network — database schema
--  Apply with:  mysql -u root -p < db/schema.sql      (or: npm run db:init)
--
--  Safe to re-run: every statement is IF NOT EXISTS. To start clean instead,
--  use `npm run db:reset`, which drops the database first.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS social_app
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE social_app;

-- ---------------------------------------------------------------- users -----
CREATE TABLE IF NOT EXISTS users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(255) NOT NULL UNIQUE,
  -- bcrypt hash (60 chars). NEVER a plaintext password.
  password        VARCHAR(255) NOT NULL,
  name            VARCHAR(100),
  bio             TEXT,
  profile_picture VARCHAR(500),
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_users_name (name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- posts -----
CREATE TABLE IF NOT EXISTS posts (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NOT NULL,
  title      VARCHAR(255) NOT NULL,
  -- sanitized rich-text HTML produced by the Quill editor
  body       TEXT         NOT NULL,
  image_url  VARCHAR(500),
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_posts_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  -- feed ordering and profile lookups
  INDEX idx_posts_created (created_at DESC),
  INDEX idx_posts_user_id (user_id, id DESC)
) ENGINE=InnoDB;

-- -------------------------------------------------------------- follows -----
CREATE TABLE IF NOT EXISTS follows (
  follower_id  INT NOT NULL,   -- the user who follows
  following_id INT NOT NULL,   -- the user being followed
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (follower_id, following_id),

  CONSTRAINT fk_follows_follower
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_follows_following
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,

  -- the PK covers follower_id lookups; this covers the reverse direction
  INDEX idx_follows_following (following_id)
) ENGINE=InnoDB;
