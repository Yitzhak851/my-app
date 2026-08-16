"""
Following.

`test_auth.py` already proves the *identity* rules — that the follower is
whoever holds the cookie, never whoever the request body names. This file
covers the rest of the feature: the rules of the relationship itself, the two
public listing endpoints, and what happens when the database refuses.
"""
import pytest

from app.services import FollowService
from app.utils.db import Database


# ───────────────────────────────────────────────────── the service rules ─────

def test_you_cannot_follow_yourself(db):
    result = FollowService.follow_user(1, 1)

    assert result['success'] is False
    assert result['error'] == 'Cannot follow yourself'


def test_following_twice_is_refused_rather_than_duplicated(db):
    a, b = db.add_user(email='a@example.com'), db.add_user(email='b@example.com')

    assert FollowService.follow_user(a, b)['success'] is True
    second = FollowService.follow_user(a, b)

    assert second['success'] is False
    assert 'Already following' in second['error']
    assert len(db.follows) == 1


def test_unfollowing_someone_you_do_not_follow_is_not_an_error(db):
    """DELETE is idempotent: the caller's goal — not following — is already true."""
    a, b = db.add_user(email='a@example.com'), db.add_user(email='b@example.com')

    assert FollowService.unfollow_user(a, b)['success'] is True


def test_check_if_following_reports_both_states(db):
    a, b = db.add_user(email='a@example.com'), db.add_user(email='b@example.com')

    assert FollowService.check_if_following(a, b)['is_following'] is False
    db.follows.add((a, b))
    assert FollowService.check_if_following(a, b)['is_following'] is True


def test_following_is_one_directional(db):
    a, b = db.add_user(email='a@example.com'), db.add_user(email='b@example.com')

    FollowService.follow_user(a, b)

    assert FollowService.check_if_following(b, a)['is_following'] is False


# ───────────────────────────────────────────────── database failure paths ────

@pytest.fixture
def broken_db(db, monkeypatch):
    """Every read fails, the way it would if MySQL went away mid-request."""
    def explode(*_a, **_k):
        raise RuntimeError('connection lost')

    monkeypatch.setattr(Database, 'execute_query', staticmethod(explode))
    monkeypatch.setattr(Database, 'execute_update', staticmethod(explode))
    return db


def test_service_calls_report_failure_instead_of_raising(broken_db):
    """
    Routes rely on the `success` flag. A service that raised instead would turn
    every one of these into an unhandled 500 with a stack trace in the log.
    """
    for result in (FollowService.follow_user(1, 2),
                   FollowService.unfollow_user(1, 2),
                   FollowService.check_if_following(1, 2),
                   FollowService.get_followers(1),
                   FollowService.get_following(1)):
        assert result['success'] is False
        assert result['error']


def test_a_database_failure_becomes_a_clean_500_not_a_stack_trace(broken_db, client, signed_in):
    res = client.get('/api/follows/1/followers')

    assert res.status_code == 500
    body = res.get_data(as_text=True).lower()
    assert 'traceback' not in body and 'connection lost' not in body


# ───────────────────────────────────────────────────────────── routes ────────

def test_follow_accepts_the_camel_case_field_name_too(db, client, signed_in):
    """The frontend has sent `followingId` since before the rewrite."""
    target = db.add_user(email='target@example.com')

    res = client.post('/api/follows/', json={'followingId': target})

    assert res.status_code == 201
    assert (signed_in, target) in db.follows


def test_follow_without_a_target_is_a_400(db, client, signed_in):
    assert client.post('/api/follows/', json={}).status_code == 400
    assert client.post('/api/follows/', json={'following_id': 'abc'}).status_code == 400


def test_unfollow_without_a_target_is_a_400(db, client, signed_in):
    assert client.delete('/api/follows/', json={}).status_code == 400


def test_following_yourself_through_the_route_is_a_400(db, client, signed_in):
    res = client.post('/api/follows/', json={'following_id': signed_in})

    assert res.status_code == 400
    assert 'yourself' in res.json['error'].lower()


def test_the_check_endpoint_needs_a_session(db, client):
    assert client.get('/api/follows/check?following_id=2').status_code == 401


def test_the_check_endpoint_requires_a_target(db, client, signed_in):
    assert client.get('/api/follows/check').status_code == 400


def test_the_check_endpoint_answers_for_the_signed_in_user(db, client, signed_in):
    target = db.add_user(email='target@example.com')
    db.follows.add((signed_in, target))

    res = client.get(f'/api/follows/check?following_id={target}')

    assert res.status_code == 200
    assert res.json['is_following'] is True


def test_the_check_endpoint_ignores_a_follower_id_in_the_query(db, client, signed_in):
    """Otherwise anyone could read anyone else's follow graph one pair at a time."""
    other = db.add_user(email='other@example.com')
    target = db.add_user(email='target@example.com')
    db.follows.add((other, target))

    res = client.get(f'/api/follows/check?following_id={target}&follower_id={other}')

    assert res.json['is_following'] is False


# ──────────────────────────────────────────────── the public listings ────────

def test_followers_and_following_are_readable_without_signing_in(db, client):
    author = db.add_user(email='author@example.com', name='Author')
    fan = db.add_user(email='fan@example.com', name='Fan')
    db.follows.add((fan, author))

    followers = client.get(f'/api/follows/{author}/followers')
    following = client.get(f'/api/follows/{fan}/following')

    assert followers.status_code == 200
    assert [u['name'] for u in followers.json] == ['Fan']
    assert following.status_code == 200
    assert [u['name'] for u in following.json] == ['Author']


def test_the_two_listings_are_not_the_same_list(db, client):
    """A copy-paste slip here silently swaps followers and following."""
    a = db.add_user(email='a@example.com', name='A')
    b = db.add_user(email='b@example.com', name='B')
    db.follows.add((a, b))          # A follows B, not the other way round

    assert client.get(f'/api/follows/{a}/followers').json == []
    assert [u['name'] for u in client.get(f'/api/follows/{a}/following').json] == ['B']
    assert [u['name'] for u in client.get(f'/api/follows/{b}/followers').json] == ['A']
    assert client.get(f'/api/follows/{b}/following').json == []


def test_the_listings_never_expose_email_addresses(db, client):
    author = db.add_user(email='author@example.com', name='Author')
    fan = db.add_user(email='fan@example.com', name='Fan')
    db.follows.add((fan, author))

    for url in (f'/api/follows/{author}/followers', f'/api/follows/{fan}/following'):
        body = client.get(url).get_data(as_text=True)
        assert '@example.com' not in body, 'a public list must not hand out addresses'
