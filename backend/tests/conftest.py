"""
Shared test fixtures.

The database layer is replaced with an in-memory fake so the suite runs with no
MySQL server, no fixture data to reset and no ordering between tests. Every
query the app issues still goes through the same Database.execute_* entry
points, so routes, services and decorators are exercised for real — only the
storage underneath is swapped.
"""
import os
import sys
import re
from datetime import datetime, timedelta

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app                      # noqa: E402
from app.utils.db import Database               # noqa: E402


class FakeDB:
    """
    A tiny stand-in for MySQL.

    It does not parse SQL; it recognises the handful of statements this app
    issues and operates on plain dicts. Anything unrecognised raises loudly,
    so a new query cannot silently pass a test by returning None.
    """

    def __init__(self):
        self.users = {}
        self.sessions = {}
        self.posts = {}
        self.follows = set()
        self.likes = set()          # (user_id, post_id)
        self.comments = {}
        self.resets = {}            # token_hash -> row
        self.next_user_id = 1
        self.next_post_id = 1
        self.next_comment_id = 1

    # -- helpers used by the tests -------------------------------------------
    def add_user(self, email='u@example.com', name='User', password_hash='x',
                 role='user', is_banned=False, is_agent=False):
        uid = self.next_user_id
        self.next_user_id += 1
        self.users[uid] = {
            'id': uid, 'email': email, 'password': password_hash, 'name': name,
            'bio': 'bio', 'profile_picture': 'pic', 'role': role,
            'is_agent': is_agent, 'is_banned': is_banned,
            'created_at': datetime(2026, 1, 1),
        }
        return uid

    def add_session(self, user_id, session_id='sess-token', expired=False):
        self.sessions[session_id] = {
            'session_id': session_id,
            'user_id': user_id,
            'expires_at': datetime.now() + timedelta(days=-1 if expired else 7),
        }
        return session_id

    def add_post(self, user_id, title='t', body='b'):
        pid = self.next_post_id
        self.next_post_id += 1
        self.posts[pid] = {
            'id': pid, 'user_id': user_id, 'title': title, 'body': body,
            'image_url': None, 'created_at': datetime(2026, 1, 1),
        }
        return pid

    def add_comment(self, post_id, user_id, body='hi', parent_id=None):
        cid = self.next_comment_id
        self.next_comment_id += 1
        self.comments[cid] = {
            'id': cid, 'post_id': post_id, 'user_id': user_id,
            'parent_id': parent_id, 'body': body, 'created_at': datetime(2026, 1, 1),
        }
        return cid

    # -- the Database interface ----------------------------------------------
    @staticmethod
    def _selected_columns(sql):
        """
        The column names a SELECT asks for, or None for `SELECT *`.

        Without this the fake returned whole rows regardless of the projection,
        so a test could not detect that a query had stopped selecting `email`.
        """
        m = re.match(r'select (.+?) from ', sql)
        if not m:
            return None
        cols = m.group(1)
        if '*' in cols:
            return None
        names = []
        for part in cols.split(','):
            part = part.strip()
            if ' as ' in part:
                part = part.split(' as ')[-1]
            names.append(part.split('.')[-1].strip('` '))
        return names

    @staticmethod
    def _project(row, columns):
        if row is None or columns is None:
            return row
        return {k: v for k, v in row.items() if k in columns}

    def execute_query(self, sql, params=None, fetch_one=False):
        s = re.sub(r'\s+', ' ', sql).strip().lower()
        p = params or ()
        columns = self._selected_columns(s)

        # session lookup (the join in SessionService.get_user)
        if 'from sessions' in s and 'join users' in s:
            row = self.sessions.get(p[0])
            if not row or row['expires_at'] <= datetime.now():
                return None
            user = self.users.get(row['user_id'])
            if not user or user['is_banned']:
                return None
            return {k: user[k] for k in
                    ('id', 'email', 'name', 'bio', 'profile_picture', 'role',
                     'is_agent', 'created_at')}

        # user by email (login, signup duplicate check, password reset)
        if 'from users where email' in s and 'is_banned' in s:
            for u in self.users.values():
                if u['email'] == p[0] and not u['is_banned']:
                    return self._project(dict(u), columns)
            return None
        if 'from users where email' in s:
            for u in self.users.values():
                if u['email'] == p[0]:
                    return u if 'select *' in s else {'id': u['id']}
            return None

        # user by id
        if 'from users where id' in s:
            u = self.users.get(p[0])
            return self._project(dict(u), columns) if u else None

        # follow check
        if 'from follows where follower_id' in s:
            return {'follower_id': p[0], 'following_id': p[1]} if (p[0], p[1]) in self.follows else None

        # likes
        if 'count(*) as count from likes where post_id' in s:
            return {'count': sum(1 for l in self.likes if l[1] == p[0])}

        # comments on a post
        if 'from comments join users' in s and 'where comments.post_id' in s:
            rows = [c for c in self.comments.values() if c['post_id'] == p[0]]
            rows.sort(key=lambda c: c['id'])
            return [{**c, 'name': self.users[c['user_id']]['name'],
                     'profile_picture': self.users[c['user_id']]['profile_picture']}
                    for c in rows]
        if 'from comments join users' in s and 'where comments.id' in s:
            c = self.comments.get(p[0])
            if not c:
                return None
            return {**c, 'name': self.users[c['user_id']]['name'],
                    'profile_picture': self.users[c['user_id']]['profile_picture']}
        if 'count(*) as count from comments where post_id' in s:
            return {'count': sum(1 for c in self.comments.values() if c['post_id'] == p[0])}
        if 'from comments where id' in s:
            c = self.comments.get(p[0])
            return self._project(dict(c), columns) if c else None

        # password reset tokens
        if 'from password_resets' in s:
            return self.resets.get(p[0])

        # post existence
        if 'select id from posts where id' in s:
            return {'id': p[0]} if p[0] in self.posts else None

        # counts used by follow-stats
        if 'count(*) as count from follows where following_id' in s:
            return {'count': sum(1 for f in self.follows if f[1] == p[0])}
        if 'count(*) as count from follows where follower_id' in s:
            return {'count': sum(1 for f in self.follows if f[0] == p[0])}
        if 'count(*) as count from posts where user_id' in s:
            return {'count': sum(1 for x in self.posts.values() if x['user_id'] == p[0])}

        # a single post joined with its author (returned after creation)
        if 'from posts join users' in s and fetch_one:
            post = self.posts.get(p[0])
            if not post:
                return None
            author = self.users[post['user_id']]
            return {**post, 'name': author['name'], 'email': author['email'],
                    'profile_picture': author['profile_picture']}

        # the feed
        if 'from posts' in s:
            rows = list(self.posts.values())
            if 'join follows' in s:
                followed = {f[1] for f in self.follows if f[0] == p[0]}
                rows = [r for r in rows if r['user_id'] in followed]
            elif 'where posts.user_id' in s:
                rows = [r for r in rows if r['user_id'] == p[0]]
            rows.sort(key=lambda r: r['id'], reverse=True)
            viewer = p[0] if 'exists(select 1 from likes' in s else None
            out = []
            for r in rows:
                a = self.users[r['user_id']]
                joined = {
                    **r,
                    'name': a['name'],
                    'profile_picture': a['profile_picture'],
                    'like_count': sum(1 for l in self.likes if l[1] == r['id']),
                    'comment_count': sum(1 for c in self.comments.values()
                                         if c['post_id'] == r['id']),
                    'liked_by_me': 1 if viewer and (viewer, r['id']) in self.likes else 0,
                }
                if columns is not None and 'email' in columns:
                    joined['email'] = a['email']
                out.append(joined)
            return out[:20]

        # user list / search
        if 'from users' in s:
            rows = [dict(u) for u in self.users.values()]
            if 'where name like' in s:
                needle = str(p[0]).strip('%').lower()
                rows = [r for r in rows if needle in (r['name'] or '').lower()]
            return [self._project(r, columns) for r in rows]

        raise AssertionError(f'FakeDB got an unrecognised query: {s[:120]}')

    def execute_update(self, sql, params=None):
        s = re.sub(r'\s+', ' ', sql).strip().lower()
        p = params or ()

        if s.startswith('insert into sessions'):
            self.sessions[p[0]] = {'session_id': p[0], 'user_id': p[1], 'expires_at': p[2]}
            return True
        if s.startswith('delete from sessions where session_id'):
            self.sessions.pop(p[0], None)
            return True
        if s.startswith('delete from sessions where user_id'):
            for k in [k for k, v in self.sessions.items() if v['user_id'] == p[0]]:
                del self.sessions[k]
            return True
        if s.startswith('delete from sessions where expires_at'):
            for k in [k for k, v in self.sessions.items() if v['expires_at'] <= datetime.now()]:
                del self.sessions[k]
            return True
        if s.startswith('insert into users'):
            uid = self.next_user_id
            self.next_user_id += 1
            self.users[uid] = {
                'id': uid, 'email': p[0], 'password': p[1], 'name': p[2],
                'bio': p[3], 'profile_picture': p[4], 'role': 'user',
                'is_agent': False, 'is_banned': False,
                'created_at': datetime(2026, 1, 1),
            }
            return uid
        if s.startswith('insert into posts'):
            return self.add_post(p[0], p[1], p[2])
        if s.startswith('insert ignore into likes') or s.startswith('insert into likes'):
            self.likes.add((p[0], p[1]))
            return True
        if s.startswith('delete from likes'):
            self.likes.discard((p[0], p[1]))
            return True
        if s.startswith('insert into comments'):
            return self.add_comment(p[0], p[1], p[3], p[2])
        if s.startswith('delete from comments'):
            self.comments.pop(p[0], None)
            return True
        if s.startswith('insert into password_resets'):
            self.resets[p[0]] = {'token_hash': p[0], 'user_id': p[1],
                                 'expires_at': p[2], 'used_at': None}
            return True
        if s.startswith('delete from password_resets'):
            for k in [k for k, v in self.resets.items() if v['user_id'] == p[0]]:
                del self.resets[k]
            return True
        if s.startswith('update password_resets set used_at'):
            if p[0] in self.resets:
                self.resets[p[0]]['used_at'] = datetime.now()
            return True
        if s.startswith('update users set password'):
            self.users[p[1]]['password'] = p[0]
            return True
        if s.startswith('insert into follows'):
            self.follows.add((p[0], p[1]))
            return True
        if s.startswith('delete from follows'):
            self.follows.discard((p[0], p[1]))
            return True

        raise AssertionError(f'FakeDB got an unrecognised update: {s[:120]}')


@pytest.fixture
def db(monkeypatch):
    fake = FakeDB()
    monkeypatch.setattr(Database, 'execute_query', staticmethod(fake.execute_query))
    monkeypatch.setattr(Database, 'execute_update', staticmethod(fake.execute_update))
    return fake


@pytest.fixture
def app(db):
    os.environ.setdefault('FLASK_ENV', 'testing')
    application = create_app()
    application.config.update(TESTING=True)
    return application


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def signed_in(db, client):
    """A signed-in regular user. Returns the user id; the client holds the cookie."""
    uid = db.add_user(email='dana@example.com', name='Dana')
    client.set_cookie('session_id', db.add_session(uid, 'session-dana'))
    return uid
