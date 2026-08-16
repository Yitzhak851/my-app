"""
Reporting, the moderation queue, bans and roles (course requirement 2.e).
"""


# ────────────────────────────────────────────────────────── reporting ───────

def test_reporting_requires_a_session(db, client):
    pid = db.add_post(db.add_user())
    assert client.post('/api/reports', json={'post_id': pid, 'reason': 'spam'}).status_code == 401


def test_a_post_can_be_reported(db, client, signed_in):
    pid = db.add_post(db.add_user(email='a@example.com'))

    res = client.post('/api/reports', json={'post_id': pid, 'reason': 'spam'})

    assert res.status_code == 201
    assert len(db.reports) == 1


def test_reporting_the_same_thing_twice_does_not_duplicate(db, client, signed_in):
    pid = db.add_post(db.add_user(email='a@example.com'))

    client.post('/api/reports', json={'post_id': pid, 'reason': 'spam'})
    second = client.post('/api/reports', json={'post_id': pid, 'reason': 'spam'})

    assert second.status_code == 201
    assert second.json['already_reported'] is True
    assert len(db.reports) == 1


def test_an_unknown_reason_is_rejected(db, client, signed_in):
    pid = db.add_post(db.add_user(email='a@example.com'))
    assert client.post('/api/reports', json={'post_id': pid, 'reason': 'because'}).status_code == 400


def test_a_report_must_name_something(db, client, signed_in):
    assert client.post('/api/reports', json={'reason': 'spam'}).status_code == 400


def test_reporting_content_that_is_gone_is_404(db, client, signed_in):
    assert client.post('/api/reports', json={'post_id': 9999, 'reason': 'spam'}).status_code == 404


# ───────────────────────────────────────────────────────── the queue ────────

def test_the_queue_is_closed_to_ordinary_users(db, client, signed_in):
    assert client.get('/api/moderation/queue').status_code == 403


def test_the_queue_is_closed_to_signed_out_visitors(client):
    assert client.get('/api/moderation/queue').status_code == 401


def test_a_moderator_sees_reports_with_the_content(db, client, moderator):
    author = db.add_user(email='author@example.com', name='Author')
    pid = db.add_post(author, title='the reported post')
    reporter = db.add_user(email='reporter@example.com', name='Reporter')
    db.add_report(reporter, 'harassment', post_id=pid)

    res = client.get('/api/moderation/queue')

    assert res.status_code == 200
    row = res.json[0]
    assert row['reason'] == 'harassment'
    assert row['post_title'] == 'the reported post'
    assert row['post_author_name'] == 'Author'
    assert row['reporter_name'] == 'Reporter'


def test_a_moderator_can_delete_a_reported_post(db, client, moderator):
    pid = db.add_post(db.add_user(email='a@example.com'))
    db.add_comment(pid, moderator, 'attached comment')

    assert client.delete(f'/api/moderation/posts/{pid}').status_code == 200
    assert pid not in db.posts
    # ON DELETE CASCADE in the real schema; the fake mirrors it.
    assert all(c['post_id'] != pid for c in db.comments.values())


def test_a_moderator_can_close_a_report(db, client, moderator):
    pid = db.add_post(db.add_user(email='a@example.com'))
    rid = db.add_report(db.add_user(email='r@example.com'), post_id=pid)

    assert client.patch(f'/api/moderation/reports/{rid}', json={'action': 'dismissed'}).status_code == 200
    assert db.reports[rid]['status'] == 'dismissed'
    assert db.reports[rid]['reviewed_by'] == moderator


def test_an_ordinary_user_cannot_delete_someone_elses_post(db, client, signed_in):
    pid = db.add_post(db.add_user(email='a@example.com'))
    assert client.delete(f'/api/moderation/posts/{pid}').status_code == 403


# ────────────────────────────────────────────── automatic flagging ──────────

def test_hostile_content_is_flagged_when_written(db, client, signed_in):
    """Requirement 2.e.iii: flag before it is published, not after a complaint."""
    pid = db.add_post(db.add_user(email='a@example.com'))

    client.post(f'/api/posts/{pid}/comments', json={'body': 'you are an idiot and a loser'})

    flagged = [c for c in db.comments.values() if c['is_flagged']]
    assert len(flagged) == 1


def test_ordinary_frustration_is_not_flagged(db, client, signed_in):
    """The failure mode that matters: a queue full of people complaining
    about bugs is a queue nobody reads."""
    pid = db.add_post(db.add_user(email='a@example.com'))

    client.post(f'/api/posts/{pid}/comments',
                json={'body': 'this deployment failed again and it is awful'})

    assert [c for c in db.comments.values() if c['is_flagged']] == []


def test_flagged_content_reaches_the_moderator(db, client, moderator):
    author = db.add_user(email='a@example.com', name='Author')
    pid = db.add_post(author)
    cid = db.add_comment(pid, author, 'you are pathetic')
    db.comments[cid]['is_flagged'] = True

    res = client.get('/api/moderation/flagged')

    assert res.status_code == 200
    assert res.json['comments'][0]['author_name'] == 'Author'


def test_a_moderator_can_clear_a_flag_without_deleting(db, client, moderator):
    pid = db.add_post(db.add_user(email='a@example.com'))
    db.posts[pid]['is_flagged'] = True

    assert client.delete(f'/api/moderation/flags/post/{pid}').status_code == 200
    assert db.posts[pid]['is_flagged'] is False
    assert pid in db.posts


# ─────────────────────────────────────────────────── bans and roles ─────────

def test_a_moderator_can_ban_an_account(db, client, moderator):
    target = db.add_user(email='troll@example.com')

    res = client.post(f'/api/moderation/users/{target}/ban', json={'banned': True})

    assert res.status_code == 200
    assert db.users[target]['is_banned'] is True


def test_banning_ends_that_accounts_sessions(db, client, moderator):
    target = db.add_user(email='troll@example.com')
    db.add_session(target, 'troll-session')

    client.post(f'/api/moderation/users/{target}/ban', json={'banned': True})

    assert 'troll-session' not in db.sessions


def test_a_banned_user_cannot_use_an_existing_cookie(db, client, moderator):
    target = db.add_user(email='troll@example.com')
    db.add_session(target, 'troll-session')

    client.post(f'/api/moderation/users/{target}/ban', json={'banned': True})

    troll = client.application.test_client()
    troll.set_cookie('session_id', 'troll-session')
    assert troll.get('/api/auth/me').status_code == 401


def test_admins_cannot_be_banned(db, client, moderator):
    other_admin = db.add_user(email='boss@example.com', role='admin')
    assert client.post(f'/api/moderation/users/{other_admin}/ban', json={'banned': True}).status_code == 403


def test_you_cannot_ban_yourself(db, client, moderator):
    assert client.post(f'/api/moderation/users/{moderator}/ban', json={'banned': True}).status_code == 400


def test_only_an_admin_may_change_roles(db, client, moderator):
    target = db.add_user(email='u@example.com')
    assert client.post(f'/api/moderation/users/{target}/role', json={'role': 'moderator'}).status_code == 403


def test_an_admin_can_promote_someone(db, client, admin):
    target = db.add_user(email='u@example.com')

    res = client.post(f'/api/moderation/users/{target}/role', json={'role': 'moderator'})

    assert res.status_code == 200
    assert db.users[target]['role'] == 'moderator'


def test_an_admin_cannot_change_their_own_role(db, client, admin):
    """Otherwise the last admin can lock everyone out of the dashboard."""
    assert client.post(f'/api/moderation/users/{admin}/role', json={'role': 'user'}).status_code == 400


def test_an_unknown_role_is_rejected(db, client, admin):
    target = db.add_user(email='u@example.com')
    assert client.post(f'/api/moderation/users/{target}/role', json={'role': 'superuser'}).status_code == 400
