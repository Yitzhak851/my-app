"""
Authentication and authorization.

The point of these tests is a single claim: **the server decides who you are,
the client does not get a vote.** Before this phase every endpoint trusted an
id sent in the request body, so anyone could act as anyone.
"""
import bcrypt


def _hash(pw):
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


# ─────────────────────────────────────────────────────── signing in ─────────

def test_login_with_correct_password_sets_a_session_cookie(db, client):
    db.add_user(email='dana@example.com', password_hash=_hash('Password123!'))

    res = client.post('/api/auth/login',
                      json={'email': 'dana@example.com', 'password': 'Password123!'})

    assert res.status_code == 200
    assert res.json['user']['email'] == 'dana@example.com'
    assert 'password' not in res.json['user']

    cookie = res.headers.get('Set-Cookie', '')
    assert 'session_id=' in cookie
    assert 'HttpOnly' in cookie, 'JavaScript must not be able to read the session'
    assert 'SameSite=Lax' in cookie


def test_login_with_a_wrong_password_is_rejected(db, client):
    db.add_user(email='dana@example.com', password_hash=_hash('Password123!'))

    res = client.post('/api/auth/login',
                      json={'email': 'dana@example.com', 'password': 'wrong'})

    assert res.status_code == 401
    assert 'session_id=' not in res.headers.get('Set-Cookie', '')


def test_login_for_an_unknown_email_gives_the_same_error(db, client):
    """The message must not reveal whether an address is registered."""
    db.add_user(email='dana@example.com', password_hash=_hash('Password123!'))

    unknown = client.post('/api/auth/login',
                          json={'email': 'nobody@example.com', 'password': 'x'})
    wrong = client.post('/api/auth/login',
                        json={'email': 'dana@example.com', 'password': 'x'})

    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json['error'] == wrong.json['error']


def test_signup_creates_an_account_and_signs_it_in(db, client):
    res = client.post('/api/auth/signup',
                      json={'email': 'new@example.com', 'password': 'Password123!'})

    assert res.status_code == 201
    assert 'session_id=' in res.headers.get('Set-Cookie', '')
    assert client.get('/api/auth/me').status_code == 200


def test_the_stored_password_is_a_hash_not_the_password(db, client):
    client.post('/api/auth/signup',
                json={'email': 'new@example.com', 'password': 'Password123!'})

    stored = next(u for u in db.users.values() if u['email'] == 'new@example.com')
    assert stored['password'] != 'Password123!'
    assert stored['password'].startswith('$2b$')


# ───────────────────────────────────────────────────────── sessions ─────────

def test_me_requires_a_session(client):
    assert client.get('/api/auth/me').status_code == 401


def test_me_returns_the_cookie_holder(db, client, signed_in):
    res = client.get('/api/auth/me')
    assert res.status_code == 200
    assert res.json['user']['id'] == signed_in


def test_logout_deletes_the_session_server_side(db, client, signed_in):
    assert 'session-dana' in db.sessions

    res = client.post('/api/auth/logout')

    assert res.status_code == 200
    assert 'session-dana' not in db.sessions, 'the row must be gone, not just the cookie'
    assert client.get('/api/auth/me').status_code == 401


def test_an_expired_session_is_not_accepted(db, client):
    uid = db.add_user()
    client.set_cookie('session_id', db.add_session(uid, 'old-token', expired=True))

    assert client.get('/api/auth/me').status_code == 401


def test_a_made_up_token_is_not_accepted(client):
    client.set_cookie('session_id', 'i-invented-this')
    assert client.get('/api/auth/me').status_code == 401


def test_a_banned_user_loses_access_immediately(db, client, signed_in):
    assert client.get('/api/auth/me').status_code == 200

    db.users[signed_in]['is_banned'] = True

    assert client.get('/api/auth/me').status_code == 401, \
        'a ban must take effect without waiting for the session to expire'


# ──────────────────────────────────────── identity cannot be forged ─────────

def test_creating_a_post_requires_signing_in(client):
    res = client.post('/api/posts/', json={'title': 't', 'body': 'b'})
    assert res.status_code == 401


def test_a_post_is_attributed_to_the_session_not_the_body(db, client, signed_in):
    """The original bug: the body's userId decided the author."""
    victim = db.add_user(email='victim@example.com', name='Victim')

    res = client.post('/api/posts/',
                      json={'title': 'impersonation', 'body': 'x', 'userId': victim})

    assert res.status_code == 201
    created = db.posts[max(db.posts)]
    assert created['user_id'] == signed_in
    assert created['user_id'] != victim, 'the client must not be able to pick an author'


def test_following_requires_signing_in(client):
    assert client.post('/api/follows/', json={'following_id': 2}).status_code == 401


def test_a_follow_is_recorded_for_the_session_not_the_body(db, client, signed_in):
    """Previously anyone could make user A follow user B."""
    a = db.add_user(email='a@example.com')
    b = db.add_user(email='b@example.com')

    res = client.post('/api/follows/', json={'follower_id': a, 'following_id': b})

    assert res.status_code == 201
    assert (signed_in, b) in db.follows
    assert (a, b) not in db.follows


def test_unfollow_only_affects_the_signed_in_user(db, client, signed_in):
    a = db.add_user(email='a@example.com')
    b = db.add_user(email='b@example.com')
    db.follows.add((a, b))
    db.follows.add((signed_in, b))

    client.delete('/api/follows/', json={'follower_id': a, 'following_id': b})

    assert (a, b) in db.follows, "someone else's follow must be untouched"
    assert (signed_in, b) not in db.follows


def test_the_following_feed_needs_a_session(client):
    res = client.get('/api/posts/?followingOnly=true')
    assert res.status_code == 401


def test_the_following_feed_uses_the_session_user(db, client, signed_in):
    """A currentUserId in the query string must not select whose feed to read."""
    other = db.add_user(email='other@example.com')
    followed = db.add_user(email='followed@example.com')

    db.add_post(followed, title='visible to dana')
    db.add_post(other, title='not followed by dana')
    db.follows.add((signed_in, followed))

    res = client.get(f'/api/posts/?followingOnly=true&currentUserId={other}')

    assert res.status_code == 200
    titles = [p['title'] for p in res.json]
    assert titles == ['visible to dana']


# ──────────────────────────────────────────────────── reading is open ───────

def test_the_global_feed_is_readable_without_signing_in(db, client):
    uid = db.add_user()
    db.add_post(uid, title='public post')

    res = client.get('/api/posts/')

    assert res.status_code == 200
    assert res.json[0]['title'] == 'public post'


def test_a_profile_is_readable_without_signing_in(db, client):
    uid = db.add_user(name='Public Person')
    res = client.get(f'/api/users/{uid}')
    assert res.status_code == 200
    assert res.json['name'] == 'Public Person'


# ──────────────────────────────────────────────────────────── roles ─────────

def test_roles_required_separates_401_from_403(db, client, app):
    """Not signed in is 401; signed in without the role is 403."""
    from flask import jsonify
    from app.utils.auth import admin_required

    @app.route('/api/test-admin-only')
    @admin_required
    def _admin_only():
        return jsonify({'ok': True})

    fresh = app.test_client()
    assert fresh.get('/api/test-admin-only').status_code == 401

    uid = db.add_user(email='plain@example.com', role='user')
    fresh.set_cookie('session_id', db.add_session(uid, 'plain-session'))
    assert fresh.get('/api/test-admin-only').status_code == 403

    admin = db.add_user(email='admin@example.com', role='admin')
    fresh.set_cookie('session_id', db.add_session(admin, 'admin-session'))
    assert fresh.get('/api/test-admin-only').status_code == 200


# ─────────────────────────────────────────────── error hygiene ──────────────

def test_errors_do_not_leak_internal_details(db, client):
    res = client.post('/api/auth/login', json={'email': 'a@b.com', 'password': 'x'})
    body = res.get_data(as_text=True).lower()
    for leak in ('traceback', 'mysql', 'sql', 'select '):
        assert leak not in body


# ─────────────────────────────────── the three shapes must agree ────────────

def test_login_returns_the_same_fields_as_me(db, client):
    """
    Login used to omit `role`, so a moderator who had just signed in had no
    role on the client and the Moderation link stayed hidden until they
    refreshed. Three endpoints describing "you" must not disagree.
    """
    db.add_user(email='mod@example.com', password_hash=_hash('Password123!'), role='moderator')

    login = client.post('/api/auth/login',
                        json={'email': 'mod@example.com', 'password': 'Password123!'})
    me = client.get('/api/auth/me')

    assert set(login.json['user']) == set(me.json['user'])
    assert login.json['user']['role'] == 'moderator'


def test_signup_returns_the_same_fields_as_me(db, client):
    signup = client.post('/api/auth/signup',
                         json={'email': 'new@example.com', 'password': 'Password123!'})
    me = client.get('/api/auth/me')

    assert set(signup.json['user']) == set(me.json['user'])
    assert signup.json['user']['role'] == 'user'


def test_no_endpoint_ever_returns_the_password_hash(db, client):
    db.add_user(email='dana@example.com', password_hash=_hash('Password123!'))

    login = client.post('/api/auth/login',
                        json={'email': 'dana@example.com', 'password': 'Password123!'})

    assert 'password' not in login.json['user']
    assert '$2b$' not in login.get_data(as_text=True)
    assert '$2b$' not in client.get('/api/auth/me').get_data(as_text=True)
