"""
"Suggested users" — optional requirement 3.e.i.

The recommendation itself is simple: people followed by the people you follow,
ranked by how many of them. What is worth testing is everything around it —
that it never suggests someone you already follow, never suggests you to
yourself, never promotes a banned account, and never leaks an address to a
person who does not know these users.
"""
import pytest

from app.services import SuggestionsService
from app.utils.db import Database


@pytest.fixture
def network(db, client):
    """
    dana follows amir and beni.
    Both of them follow gil. Only amir follows hila.
    dana already follows amir — so amir must never come back as a suggestion.
    """
    ids = {}
    for name in ('dana', 'amir', 'beni', 'gil', 'hila', 'lonely'):
        ids[name] = db.add_user(email=f'{name}@example.com', name=name.title())

    db.follows.update({
        (ids['dana'], ids['amir']),
        (ids['dana'], ids['beni']),
        (ids['amir'], ids['gil']),
        (ids['beni'], ids['gil']),
        (ids['amir'], ids['hila']),
        (ids['amir'], ids['dana']),      # amir follows dana back
    })

    client.set_cookie('session_id', db.add_session(ids['dana'], 'session-dana'))
    return ids


def names(response):
    return [u['name'] for u in response.json]


# ────────────────────────────────────────────────────── the recommendation ───

def test_it_suggests_people_your_circle_follows(client, network):
    res = client.get('/api/users/suggestions')

    assert res.status_code == 200
    assert 'Gil' in names(res)
    assert 'Hila' in names(res)


def test_the_strongest_connection_comes_first(client, network):
    """Gil is followed by both of dana's contacts; Hila by one."""
    res = client.get('/api/users/suggestions')

    ranked = names(res)
    assert ranked.index('Gil') < ranked.index('Hila')


def test_each_suggestion_carries_the_reason_for_it(client, network):
    """"Followed by 2 people you follow" is a reason; a bare name is not."""
    res = client.get('/api/users/suggestions')

    gil = next(u for u in res.json if u['name'] == 'Gil')
    assert gil['mutual_count'] == 2
    assert gil['basis'] == 'mutual'
    assert gil['reason'] == 'Followed by 2 people you follow'


def test_the_reason_reads_correctly_for_a_single_connection(client, network):
    res = client.get('/api/users/suggestions')

    hila = next(u for u in res.json if u['name'] == 'Hila')
    assert hila['reason'] == 'Followed by 1 person you follow'


# ─────────────────────────────────────────────────── who is never suggested ──

def test_it_never_suggests_someone_already_followed(client, network):
    """
    The one that matters most. Without the NOT EXISTS clause the top suggestion
    is always someone already followed — they are exactly who the circle
    overlaps on.
    """
    assert 'Amir' not in names(client.get('/api/users/suggestions'))
    assert 'Beni' not in names(client.get('/api/users/suggestions'))


def test_it_never_suggests_you_to_yourself(client, network):
    # Amir follows Dana, so Dana is reachable through her own circle.
    assert 'Dana' not in names(client.get('/api/users/suggestions'))


def test_it_never_promotes_a_banned_account(db, client, network):
    assert 'Gil' in names(client.get('/api/users/suggestions'))

    db.users[network['gil']]['is_banned'] = True

    assert 'Gil' not in names(client.get('/api/users/suggestions'))


def test_a_suggestion_never_carries_an_email_address(client, network):
    body = client.get('/api/users/suggestions').get_data(as_text=True)

    assert '@example.com' not in body


# ──────────────────────────────────────────────────────────── the fallback ───

def test_a_brand_new_account_still_gets_suggestions(db, client, network):
    """
    Someone who follows nobody has no mutual connections. An empty box is the
    least useful thing to show a new user, so the list falls back to the
    accounts most people follow.
    """
    newcomer = db.add_user(email='new@example.com', name='Newcomer')
    client.set_cookie('session_id', db.add_session(newcomer, 'session-new'))

    res = client.get('/api/users/suggestions')

    assert res.status_code == 200
    assert len(res.json) > 0
    assert all(u['basis'] == 'popular' for u in res.json)
    assert all(u['reason'] == 'Popular right now' for u in res.json)


def test_the_fallback_tops_up_rather_than_replaces(client, network):
    """
    Two real suggestions and a limit of five should be the two real ones first,
    then popular accounts — not five popular ones.
    """
    res = client.get('/api/users/suggestions?limit=5')

    bases = [u['basis'] for u in res.json]
    assert bases[:2] == ['mutual', 'mutual']
    assert 'popular' in bases[2:]


def test_the_fallback_also_skips_people_already_followed(db, client):
    star = db.add_user(email='star@example.com', name='Star')
    viewer = db.add_user(email='viewer@example.com', name='Viewer')
    fan = db.add_user(email='fan@example.com', name='Fan')
    db.follows.update({(fan, star), (viewer, star)})
    client.set_cookie('session_id', db.add_session(viewer, 'session-viewer'))

    assert 'Star' not in names(client.get('/api/users/suggestions'))


# ────────────────────────────────────────────────────────── access and size ──

def test_suggestions_require_signing_in(db, client):
    """They describe who you follow, which is not public."""
    assert client.get('/api/users/suggestions').status_code == 401


def test_the_list_is_for_the_session_user_not_a_user_id_in_the_query(client, network):
    """Otherwise this endpoint reads out anyone else's social graph."""
    res = client.get(f'/api/users/suggestions?user_id={network["hila"]}')

    assert 'Gil' in names(res)          # still Dana's suggestions


def test_the_limit_is_honoured(client, network):
    assert len(client.get('/api/users/suggestions?limit=1').json) == 1


def test_an_enormous_limit_is_capped(db, client, network):
    for i in range(40):
        db.add_user(email=f'extra{i}@example.com', name=f'Extra {i}')

    res = client.get('/api/users/suggestions?limit=10000')

    assert len(res.json) <= 20


def test_a_limit_of_zero_does_not_produce_an_empty_or_broken_list(client, network):
    res = client.get('/api/users/suggestions?limit=0')

    assert res.status_code == 200
    assert len(res.json) >= 1


# ───────────────────────────────────────────────────────────────── failure ───

def test_a_database_failure_is_reported_without_leaking_the_query(db, client, network, monkeypatch):
    def explode(*_a, **_k):
        raise RuntimeError("Unknown column 'u.secret' in 'field list'")

    working = db.execute_query
    monkeypatch.setattr(Database, 'execute_query', staticmethod(
        lambda sql, params=None, fetch_one=False: (
            working(sql, params, fetch_one) if 'FROM sessions' in sql else explode()
        )))

    res = client.get('/api/users/suggestions')
    body = res.get_data(as_text=True).lower()

    assert res.status_code == 500
    assert 'unknown column' not in body
    assert 'secret' not in body


def test_the_service_reports_failure_rather_than_raising(db, monkeypatch):
    def explode(*_a, **_k):
        raise RuntimeError('connection lost')

    monkeypatch.setattr(Database, 'execute_query', staticmethod(explode))

    result = SuggestionsService.for_user(1)

    assert result['success'] is False
    assert result['error'] == 'Could not load suggestions'
