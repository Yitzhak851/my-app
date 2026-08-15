-- =============================================================================
--  YBO Social Network — database schema
--
--  Apply with:  npm run db:init      (or: mysql -u root -p < db/schema.sql)
--
--  This file is a MIGRATION, not just a definition. It is safe to run against
--  an existing database that already holds real users and posts: every table is
--  created only if missing, and every column, index and foreign key is added
--  only if it is not already there. Nothing is dropped and no data is lost.
--
--  `npm run db:reset` drops the database first — that one IS destructive.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS social_app
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE social_app;

-- ═══════════════════════════════════════════════ migration helpers ══════════
-- MySQL has no ADD COLUMN IF NOT EXISTS (MariaDB does, MySQL does not), so we
-- check information_schema first and build the statement dynamically.

DROP PROCEDURE IF EXISTS ybo_add_column;
DROP PROCEDURE IF EXISTS ybo_add_index;
DROP PROCEDURE IF EXISTS ybo_cascade_fk;

DELIMITER $$

CREATE PROCEDURE ybo_add_column(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
    PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$

CREATE PROCEDURE ybo_add_index(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = idx
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD INDEX `', idx, '` (', cols, ')');
    PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$

-- Databases created from the original README snippet have foreign keys with no
-- ON DELETE rule, so deleting a user fails instead of removing their content.
-- The admin dashboard needs that delete to work, so bring old keys up to date.
CREATE PROCEDURE ybo_cascade_fk(
  IN tbl VARCHAR(64), IN col VARCHAR(64),
  IN ref_tbl VARCHAR(64), IN ref_col VARCHAR(64), IN fk_name VARCHAR(64))
BEGIN
  DECLARE existing VARCHAR(64) DEFAULT NULL;
  DECLARE rule VARCHAR(32) DEFAULT NULL;

  SELECT k.CONSTRAINT_NAME, r.DELETE_RULE INTO existing, rule
  FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r
    ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
   AND r.CONSTRAINT_NAME   = k.CONSTRAINT_NAME
  WHERE k.TABLE_SCHEMA = DATABASE()
    AND k.TABLE_NAME = tbl
    AND k.COLUMN_NAME = col
    AND k.REFERENCED_TABLE_NAME = ref_tbl
  LIMIT 1;

  IF existing IS NULL THEN
    SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD CONSTRAINT `', fk_name,
                      '` FOREIGN KEY (`', col, '`) REFERENCES `', ref_tbl,
                      '`(`', ref_col, '`) ON DELETE CASCADE');
    PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
  ELSEIF rule <> 'CASCADE' THEN
    SET @sql = CONCAT('ALTER TABLE `', tbl, '` DROP FOREIGN KEY `', existing, '`');
    PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
    SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD CONSTRAINT `', fk_name,
                      '` FOREIGN KEY (`', col, '`) REFERENCES `', ref_tbl,
                      '`(`', ref_col, '`) ON DELETE CASCADE');
    PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
  END IF;
END$$

DELIMITER ;

-- ═══════════════════════════════════════════════════════ core tables ════════

-- ---------------------------------------------------------------- users -----
CREATE TABLE IF NOT EXISTS users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(255) NOT NULL UNIQUE,
  -- bcrypt hash (60 chars). NEVER a plaintext password.
  password        VARCHAR(255) NOT NULL,
  name            VARCHAR(100),
  bio             TEXT,
  profile_picture VARCHAR(500),
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- posts -----
CREATE TABLE IF NOT EXISTS posts (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NOT NULL,
  title      VARCHAR(255) NOT NULL,
  -- sanitized rich-text HTML produced by the Quill editor
  body       TEXT         NOT NULL,
  image_url  VARCHAR(500),
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- -------------------------------------------------------------- follows -----
CREATE TABLE IF NOT EXISTS follows (
  follower_id  INT NOT NULL,   -- the user who follows
  following_id INT NOT NULL,   -- the user being followed
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, following_id)
) ENGINE=InnoDB;

-- ═════════════════════════════════════════════════════ new in phase 3 ══════

-- ------------------------------------------------------------- sessions -----
-- Server-side sessions, as taught in the course (lecture "User Management 101").
-- The client only ever holds the opaque session_id, in an HttpOnly cookie.
--
-- Deviation from the slide: the lecture declares user_id UNIQUE, i.e. one
-- session per account. We allow several so signing in on a second device does
-- not silently sign you out of the first, and so logout can end one session
-- rather than all of them.
CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) PRIMARY KEY,
  user_id    INT      NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,

  CONSTRAINT fk_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- likes -----
-- The composite primary key is what makes a second like from the same user a
-- no-op rather than a duplicate row (requirement 2.b.i).
CREATE TABLE IF NOT EXISTS likes (
  user_id    INT NOT NULL,
  post_id    INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (user_id, post_id),

  CONSTRAINT fk_likes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_likes_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,

  -- counting likes for a post is the hot query
  INDEX idx_likes_post (post_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------- comments -----
-- Flat by default; parent_id allows one level of nesting without a rewrite
-- (requirement 2.b.ii). sentiment_score/is_flagged support requirement 2.e.iii.
CREATE TABLE IF NOT EXISTS comments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  post_id         INT  NOT NULL,
  user_id         INT  NOT NULL,
  parent_id       INT  NULL,
  body            TEXT NOT NULL,
  sentiment_score DECIMAL(4,3) NULL,      -- -1.000 (toxic) .. 1.000 (positive)
  is_flagged      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_comments_post   FOREIGN KEY (post_id)   REFERENCES posts(id)    ON DELETE CASCADE,
  CONSTRAINT fk_comments_user   FOREIGN KEY (user_id)   REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_comments_parent FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE,

  INDEX idx_comments_post (post_id, created_at),
  INDEX idx_comments_flagged (is_flagged)
) ENGINE=InnoDB;

-- -------------------------------------------------------------- reports -----
-- A report targets either a post or a comment (requirement 2.e.ii).
CREATE TABLE IF NOT EXISTS reports (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  reporter_id INT NOT NULL,
  post_id     INT NULL,
  comment_id  INT NULL,
  reason      VARCHAR(255) NOT NULL,
  status      ENUM('open', 'actioned', 'dismissed') NOT NULL DEFAULT 'open',
  reviewed_by INT NULL,
  reviewed_at DATETIME NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_reports_post     FOREIGN KEY (post_id)     REFERENCES posts(id)    ON DELETE CASCADE,
  CONSTRAINT fk_reports_comment  FOREIGN KEY (comment_id)  REFERENCES comments(id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)    ON DELETE SET NULL,

  -- a report with neither target is meaningless
  CONSTRAINT chk_reports_target CHECK (post_id IS NOT NULL OR comment_id IS NOT NULL),

  -- the moderator queue reads open reports, newest first
  INDEX idx_reports_status (status, created_at)
) ENGINE=InnoDB;

-- ------------------------------------------------------ password_resets -----
-- Only the SHA-256 of the reset token is stored. A leaked database therefore
-- does not let an attacker reset anyone's password (requirement 2.a.i).
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash CHAR(64) PRIMARY KEY,
  user_id    INT      NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  INDEX idx_resets_user (user_id),
  INDEX idx_resets_expires (expires_at)
) ENGINE=InnoDB;

-- ═══════════════════════════════════════ columns added to existing tables ═══

-- users: moderation roles (2.e.i) and autonomous agents (2.d)
CALL ybo_add_column('users', 'role',
  "ENUM('user','moderator','admin') NOT NULL DEFAULT 'user'");
CALL ybo_add_column('users', 'is_agent',
  'BOOLEAN NOT NULL DEFAULT FALSE');
CALL ybo_add_column('users', 'personality',
  'VARCHAR(500) NULL COMMENT "Drives what an agent posts. NULL for humans."');
CALL ybo_add_column('users', 'is_banned',
  'BOOLEAN NOT NULL DEFAULT FALSE');
CALL ybo_add_column('users', 'updated_at',
  'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

-- posts: moderation state (2.e.ii / 2.e.iii)
CALL ybo_add_column('posts', 'sentiment_score', 'DECIMAL(4,3) NULL');
CALL ybo_add_column('posts', 'is_flagged', 'BOOLEAN NOT NULL DEFAULT FALSE');
CALL ybo_add_column('posts', 'updated_at',
  'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

-- ═══════════════════════════════════════════════════════════ indexes ════════

CALL ybo_add_index('users',   'idx_users_name',      '`name`');
CALL ybo_add_index('users',   'idx_users_agents',    '`is_agent`');
CALL ybo_add_index('posts',   'idx_posts_created',   '`created_at` DESC');
CALL ybo_add_index('posts',   'idx_posts_user_id',   '`user_id`, `id` DESC');
CALL ybo_add_index('posts',   'idx_posts_flagged',   '`is_flagged`');
CALL ybo_add_index('follows', 'idx_follows_following', '`following_id`');

-- ═══════════════════════════════════════════════════ foreign key rules ══════
-- Brings pre-existing keys up to ON DELETE CASCADE without touching data.

CALL ybo_cascade_fk('posts',   'user_id',      'users', 'id', 'fk_posts_user');
CALL ybo_cascade_fk('follows', 'follower_id',  'users', 'id', 'fk_follows_follower');
CALL ybo_cascade_fk('follows', 'following_id', 'users', 'id', 'fk_follows_following');

-- ═══════════════════════════════════════════════════════════ cleanup ════════

DROP PROCEDURE IF EXISTS ybo_add_column;
DROP PROCEDURE IF EXISTS ybo_add_index;
DROP PROCEDURE IF EXISTS ybo_cascade_fk;
