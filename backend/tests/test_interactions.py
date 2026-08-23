"""
Likes and comments (course requirements 2.b.i and 2.b.ii).
"""


# ─────────────────────────────────────────────────────────────── likes ──────

def test_liking_requires_a_session(db, client):
    uid = db.add_user()
    pid = db.add_post(uid)
    assert client.post(f'/api/posts/{pid}/like').status_code == 401


def test_a_like_is_recorded_for_the_signed_in_user(db, client, signed_in):
    pid = db.add_post(db.add_user(email='author@example.com'))

    res = client.post(f'/api/posts/{pid}/like')

    assert res.status_code == 200
    assert res.json == {'liked': True, 'count': 1}
    assert (signed_in, pid) in db.likes


def test_liking_twice_does_not_double_count(db, client, signed_in):
    """A double click must not create two likes."""
    pid = db.add_post(db.add_user(email='author@example.com'))

    client.post(f'/api/posts/{pid}/like')
    second = client.post(f'/api/posts/{pid}/like')

    assert second.status_code == 200
    assert second.json['count'] == 1


def test_unliking_removes_it(db, client, signed_in):
    pid = db.add_post(db.add_user(email='author@example.com'))
    client.post(f'/api/posts/{pid}/like')

    res = client.delete(f'/api/posts/{pid}/like')

    assert res.status_code == 200
    assert res.json == {'liked': False, 'count': 0}
    assert (signed_in, pid) not in db.likes


def test_unliking_something_you_never_liked_is_harmless(db, client, signed_in):
    pid = db.add_post(db.add_user(email='author@example.com'))
    res = client.delete(f'/api/posts/{pid}/like')
    assert res.status_code == 200
    assert res.json['count'] == 0


def test_liking_a_missing_post_is_404(client, signed_in):
    assert client.post('/api/posts/9999/like').status_code == 404


def test_the_feed_reports_like_counts_and_whether_you_liked(db, client, signed_in):
    author = db.add_user(email='author@example.com')
    liked = db.add_post(author, title='liked one')
    other = db.add_post(author, title='not liked')

    client.post(f'/api/posts/{liked}/like')
    db.likes.add((author, liked))  # someone else likes it too

    posts = {p['title']: p for p in client.get('/api/posts/').json}

    assert posts['liked one']['like_count'] == 2
    assert posts['liked one']['liked_by_me'] is True
    assert posts['not liked']['like_count'] == 0
    assert posts['not liked']['liked_by_me'] is False


def test_a_signed_out_visitor_sees_counts_but_never_liked_by_me(db, client):
    author = db.add_user()
    pid = db.add_post(author)
    db.likes.add((author, pid))

    post = client.get('/api/posts/').json[0]

    assert post['like_count'] == 1
    assert post['liked_by_me'] is False


# ──────────────────────────────────────────────────────────── comments ──────

def test_comments_are_readable_without_signing_in(db, client):
    uid = db.add_user(name='Dana')
    pid = db.add_post(uid)
    db.add_comment(pid, uid, 'a public comment')

    res = client.get(f'/api/posts/{pid}/comments')

    assert res.status_code == 200
    assert res.json[0]['body'] == 'a public comment'
    assert res.json[0]['name'] == 'Dana'


def test_commenting_requires_a_session(db, client):
    pid = db.add_post(db.add_user())
    assert client.post(f'/api/posts/{pid}/comments', json={'body': 'hi'}).status_code == 401


def test_a_comment_is_attributed_to_the_session(db, client, signed_in):
    victim = db.add_user(email='victim@example.com')
    pid = db.add_post(db.add_user(email='author@example.com'))

    res = client.post(f'/api/posts/{pid}/comments',
                      json={'body': 'nice post', 'user_id': victim})

    assert res.status_code == 201
    assert res.json['comment']['user_id'] == signed_in
    assert res.json['comment']['body'] == 'nice post'


def test_an_empty_comment_is_rejected(db, client, signed_in):
    pid = db.add_post(db.add_user(email='a@example.com'))

    assert client.post(f'/api/posts/{pid}/comments', json={'body': '   '}).status_code == 400
    assert client.post(f'/api/posts/{pid}/comments', json={}).status_code == 400


def test_an_overlong_comment_is_rejected(db, client, signed_in):
    pid = db.add_post(db.add_user(email='a@example.com'))
    res = client.post(f'/api/posts/{pid}/comments', json={'body': 'x' * 1001})
    assert res.status_code == 400


def test_commenting_on_a_missing_post_is_404(client, signed_in):
    assert client.post('/api/posts/9999/comments', json={'body': 'hi'}).status_code == 404


def test_a_reply_records_its_parent(db, client, signed_in):
    pid = db.add_post(db.add_user(email='a@example.com'))
    parent = db.add_comment(pid, signed_in, 'first')

    res = client.post(f'/api/posts/{pid}/comments',
                      json={'body': 'a reply', 'parent_id': parent})

    assert res.status_code == 201
    assert res.json['comment']['parent_id'] == parent


def test_a_reply_cannot_point_at_a_comment_on_another_post(db, client, signed_in):
    """Otherwise a comment could be attached to a thread it does not belong to."""
    post_a = db.add_post(db.add_user(email='a@example.com'))
    post_b = db.add_post(db.add_user(email='b@example.com'))
    parent_on_a = db.add_comment(post_a, signed_in, 'on A')

    res = client.post(f'/api/posts/{post_b}/comments',
                      json={'body': 'sneaky', 'parent_id': parent_on_a})

    assert res.status_code == 400


def test_you_can_delete_your_own_comment(db, client, signed_in):
    pid = db.add_post(db.add_user(email='a@example.com'))
    cid = db.add_comment(pid, signed_in, 'mine')

    assert client.delete(f'/api/comments/{cid}').status_code == 200
    assert cid not in db.comments


def test_you_cannot_delete_someone_elses_comment(db, client, signed_in):
    other = db.add_user(email='other@example.com')
    pid = db.add_post(other)
    cid = db.add_comment(pid, other, 'theirs')

    assert client.delete(f'/api/comments/{cid}').status_code == 403
    assert cid in db.comments


def test_a_moderator_can_delete_anyones_comment(db, client):
    author = db.add_user(email='author@example.com')
    pid = db.add_post(author)
    cid = db.add_comment(pid, author, 'offensive')

    mod = db.add_user(email='mod@example.com', role='moderator')
    client.set_cookie('session_id', db.add_session(mod, 'mod-session'))

    assert client.delete(f'/api/comments/{cid}').status_code == 200
    assert cid not in db.comments


def test_the_feed_reports_comment_counts(db, client):
    uid = db.add_user()
    pid = db.add_post(uid, title='discussed')
    db.add_comment(pid, uid)
    db.add_comment(pid, uid)

    post = client.get('/api/posts/').json[0]

    assert post['comment_count'] == 2

# ─────────────────────────────────────────────────── paging limits ──────────

def test_the_feed_caps_an_enormous_limit(db, client):
    """
    `?limit=1000000` used to return every post with its author joined on, in
    one request. The user directory was capped in Phase 8; the feed was not.
    """
    uid = db.add_user()
    for i in range(120):
        db.add_post(uid, title=f'Post {i}')

    assert len(client.get('/api/posts/?limit=1000000').json) <= 100


def test_a_negative_start_does_not_wrap_around(db, client):
    uid = db.add_user()
    db.add_post(uid, title='only post')

    res = client.get('/api/posts/?start=-5&limit=5')

    assert res.status_code == 200
    assert [p['title'] for p in res.json] == ['only post']


def test_a_non_numeric_limit_falls_back_to_the_default(db, client):
    uid = db.add_user()
    db.add_post(uid)

    assert client.get('/api/posts/?limit=abc').status_code == 200
