"""
The public user directory.

Two things matter here and they pull in opposite directions: the list has to be
open (requirement 1.c — anyone can browse and search users), and being open is
exactly why it must not hand out email addresses or unbounded pages.
"""
import pytest

from app.services import UsersService
from app.utils.db import Database


@pytest.fixture
def people(db):
    return {
        'dana': db.add_user(email='dana@example.com', name='Dana Cohen'),
        'danny': db.add_user(email='danny@example.com', name='Danny Levi'),
        'ruth': db.add_user(email='ruth@example.com', name='Ruth Bar'),
    }


# ─────────────────────────────────────────────────────────── listing ─────────

def test_the_directory_is_readable_without_signing_in(client, people):
    res = client.get('/api/users/')

    assert res.status_code == 200
    assert {u['name'] for u in res.json} == {'Dana Cohen', 'Danny Levi', 'Ruth Bar'}


def test_no_listing_response_contains_an_email_address(client, people):
    """The original projection was `SELECT *`, which published every address."""
    body = client.get('/api/users/').get_data(as_text=True)

    assert '@example.com' not in body


def test_a_single_profile_does_not_contain_an_email_address(client, people):
    res = client.get(f'/api/users/{people["dana"]}')

    assert res.status_code == 200
    assert 'email' not in res.json


def test_a_profile_does_not_contain_the_password_hash(client, people):
    res = client.get(f'/api/users/{people["dana"]}')

    assert 'password' not in res.json


# ──────────────────────────────────────────────────────────── search ─────────

def test_search_matches_part_of_a_name(client, people):
    res = client.get('/api/users/?search=Dan')

    assert {u['name'] for u in res.json} == {'Dana Cohen', 'Danny Levi'}


def test_search_is_case_insensitive(client, people):
    assert len(client.get('/api/users/?search=dan').json) == 2


def test_search_does_not_match_on_email(client, people):
    """
    Requirement 1.c.i is search *by username*. Matching the email column as well
    turned the search box into an address-harvesting tool: type "@gmail" and
    read back every Gmail user on the site.
    """
    res = client.get('/api/users/?search=dana@example.com')

    assert res.json == []


def test_a_search_with_no_matches_is_an_empty_list_not_an_error(client, people):
    res = client.get('/api/users/?search=zzzzz')

    assert res.status_code == 200
    assert res.json == []


# ─────────────────────────────────────────────────────────── paging ──────────

def test_limit_and_start_page_through_the_directory(client, people):
    first = client.get('/api/users/?limit=2&start=0').json
    second = client.get('/api/users/?limit=2&start=2').json

    assert len(first) == 2
    assert len(second) == 1
    assert {u['id'] for u in first}.isdisjoint({u['id'] for u in second})


def test_an_enormous_limit_is_capped(client, db):
    """`?limit=1000000` must not be a one-request dump of the user table."""
    for i in range(120):
        db.add_user(email=f'u{i}@example.com', name=f'User {i}')

    res = client.get('/api/users/?limit=1000000')

    assert len(res.json) == 100


def test_a_negative_start_does_not_wrap_around(client, people):
    """A negative offset in Python slices from the end — silently wrong data."""
    res = client.get('/api/users/?start=-1&limit=2')

    assert [u['id'] for u in res.json] == [people['dana'], people['danny']]


def test_a_non_numeric_limit_falls_back_to_the_default(client, people):
    res = client.get('/api/users/?limit=abc')

    assert res.status_code == 200


# ────────────────────────────────────────────────────── single profile ───────

def test_an_unknown_user_is_a_404(client, people):
    res = client.get('/api/users/999999')

    assert res.status_code == 404
    assert res.json['error'] == 'User not found'


def test_a_profile_carries_the_fields_the_page_renders(client, people):
    res = client.get(f'/api/users/{people["ruth"]}')

    assert set(res.json) >= {'id', 'name', 'bio', 'profile_picture', 'role', 'is_agent'}


# ──────────────────────────────────────────────────────── follow stats ───────

def test_follow_stats_count_followers_following_and_posts(client, db, people):
    dana, danny, ruth = people['dana'], people['danny'], people['ruth']
    db.follows.add((danny, dana))
    db.follows.add((ruth, dana))
    db.follows.add((dana, ruth))
    db.add_post(dana)
    db.add_post(dana)
    db.add_post(danny)

    res = client.get(f'/api/users/{dana}/follow-stats')

    assert res.status_code == 200
    assert res.json == {'followers': 2, 'following': 1, 'posts': 2}


def test_follow_stats_for_a_brand_new_user_are_all_zero(client, people):
    res = client.get(f'/api/users/{people["ruth"]}/follow-stats')

    assert res.json == {'followers': 0, 'following': 0, 'posts': 0}


def test_follow_stats_are_public(client, people):
    assert client.get(f'/api/users/{people["dana"]}/follow-stats').status_code == 200


# ────────────────────────────────────────────────── failure behaviour ────────

@pytest.fixture
def broken_db(db, monkeypatch):
    def explode(*_a, **_k):
        raise RuntimeError("Table 'social_app.users' doesn't exist")

    monkeypatch.setattr(Database, 'execute_query', staticmethod(explode))
    return db


def test_the_services_report_failure_rather_than_raising(broken_db):
    for result in (UsersService.fetch_users(),
                   UsersService.get_user_by_id(1),
                   UsersService.get_user_follow_stats(1)):
        assert result['success'] is False
        assert result['error']


def test_a_database_error_is_not_echoed_to_the_client(broken_db, client):
    """
    These three used to answer with `str(exception)`. A driver message quotes
    the failing statement, which tells an attacker the table and column names.
    """
    for url in ('/api/users/', '/api/users/1', '/api/users/1/follow-stats'):
        res = client.get(url)
        body = res.get_data(as_text=True).lower()

        assert res.status_code == 500, url
        assert 'social_app' not in body, url
        assert 'table' not in body, url
        assert 'traceback' not in body, url
