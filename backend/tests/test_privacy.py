"""
What the public API is allowed to reveal.

Email addresses used to be returned by every user-facing endpoint and were
matched by the search box, which made every address on the site enumerable by
anyone — signed in or not.
"""


def test_the_user_list_does_not_expose_email(db, client):
    db.add_user(email='private@example.com', name='Dana')

    res = client.get('/api/users/')

    assert res.status_code == 200
    assert 'email' not in res.json[0]
    assert 'private@example.com' not in res.get_data(as_text=True)


def test_a_single_profile_does_not_expose_email(db, client):
    uid = db.add_user(email='private@example.com', name='Dana')

    res = client.get(f'/api/users/{uid}')

    assert res.status_code == 200
    assert 'email' not in res.json
    assert res.json['name'] == 'Dana'


def test_the_feed_does_not_expose_author_email(db, client):
    uid = db.add_user(email='private@example.com', name='Dana')
    db.add_post(uid, title='a post')

    res = client.get('/api/posts/')

    assert res.status_code == 200
    assert 'private@example.com' not in res.get_data(as_text=True)


def test_search_matches_the_username(db, client):
    db.add_user(email='a@example.com', name='Dana Levi')
    db.add_user(email='b@example.com', name='Omri Cohen')

    res = client.get('/api/users/?search=Dana')

    assert res.status_code == 200
    names = [u['name'] for u in res.json]
    assert 'Dana Levi' in names


def test_you_can_still_see_your_own_email(db, client, signed_in):
    """Hiding it from others must not hide it from you."""
    res = client.get('/api/auth/me')

    assert res.status_code == 200
    assert res.json['user']['email'] == 'dana@example.com'
