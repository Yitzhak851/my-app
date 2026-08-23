"""
What every endpoint does when the database goes away.

This is one test applied to the whole API rather than a test per route, because
the property being checked is the same everywhere and it is easy to lose on a
single endpoint without noticing:

  1. the request fails cleanly — a JSON body and a sensible status, never an
     unhandled exception and never a 200 pretending everything is fine;
  2. the response says nothing about MySQL, the schema or the SQL. Driver
     messages quote the failing statement, and the statement names the tables
     and columns. `str(exception)` passed to `jsonify` is the usual way that
     happens, and several services return exactly that to their route.

The session lookup is deliberately left working. Breaking it too would turn
every case below into a 401 and the test would pass without testing anything.
"""
import pytest

from app.utils.db import Database

# The exception text is chosen so that any leak is unmistakable in the response.
DB_ERROR = "1054 (42S22): Unknown column 'users.secret_column' in 'field list'"

LEAK_MARKERS = ('42s22', 'secret_column', 'unknown column', 'traceback',
                'mysql', 'select ', 'insert ', 'file "')


@pytest.fixture
def outage(db, monkeypatch):
    """MySQL is down for everything except resolving the session cookie."""
    working_query = db.execute_query

    def query(sql, params=None, fetch_one=False):
        if 'FROM sessions' in sql:
            return working_query(sql, params, fetch_one)
        raise RuntimeError(DB_ERROR)

    def update(sql, params=None):
        if 'sessions' in sql:
            return db.execute_update(sql, params)
        raise RuntimeError(DB_ERROR)

    monkeypatch.setattr(Database, 'execute_query', staticmethod(query))
    monkeypatch.setattr(Database, 'execute_update', staticmethod(update))
    return db


# Every route in the app that touches the database, with a body where one is
# needed. Kept as data so adding an endpoint means adding one line here.
ROUTES = [
    ('get', '/api/posts/', None),
    ('post', '/api/posts/', {'title': 'x', 'body': 'y'}),
    ('get', '/api/users/', None),
    ('get', '/api/users/1', None),
    ('get', '/api/users/1/follow-stats', None),
    ('post', '/api/follows/', {'following_id': 2}),
    ('delete', '/api/follows/', {'following_id': 2}),
    ('get', '/api/follows/check?following_id=2', None),
    ('get', '/api/follows/1/followers', None),
    ('get', '/api/follows/1/following', None),
    ('post', '/api/posts/1/like', None),
    ('delete', '/api/posts/1/like', None),
    ('get', '/api/posts/1/comments', None),
    ('post', '/api/posts/1/comments', {'body': 'hello'}),
    ('delete', '/api/comments/1', None),
    ('post', '/api/reports', {'post_id': 1, 'reason': 'spam'}),
    ('get', '/api/moderation/queue', None),
    ('get', '/api/moderation/flagged', None),
    ('patch', '/api/moderation/reports/1', {'action': 'resolved'}),
    ('delete', '/api/moderation/posts/1', None),
    ('delete', '/api/moderation/comments/1', None),
    ('delete', '/api/moderation/flags/post/1', None),
    ('get', '/api/moderation/users', None),
    ('post', '/api/moderation/users/2/ban', {'banned': True}),
    ('post', '/api/moderation/users/2/role', {'role': 'moderator'}),
    ('post', '/api/auth/signup', {'email': 'x@y.com', 'password': 'Password123!'}),
    ('post', '/api/auth/login', {'email': 'x@y.com', 'password': 'Password123!'}),
    ('post', '/api/auth/forgot-password', {'email': 'x@y.com'}),
    ('post', '/api/auth/reset-password', {'token': 'abc', 'password': 'Password123!'}),
    ('post', '/api/ai/autocorrect', {'text': 'teh'}),
    ('get', '/api/ai/suggest-comments/1', None),
]

# The endpoints that answer 200 even during an outage, on purpose.
DEGRADE_TO_200 = {
    '/api/auth/forgot-password',
    '/api/ai/autocorrect',
    '/api/ai/suggest-comments/1',
}


@pytest.mark.parametrize('method,url,payload', ROUTES)
def test_no_endpoint_leaks_database_internals_when_the_database_fails(
        outage, client, admin, method, url, payload):
    call = getattr(client, method)
    res = call(url, json=payload) if payload is not None else call(url)

    body = res.get_data(as_text=True).lower()
    for marker in LEAK_MARKERS:
        assert marker not in body, f'{method.upper()} {url} leaked "{marker}": {body[:200]}'


@pytest.mark.parametrize('method,url,payload', ROUTES)
def test_no_endpoint_raises_or_claims_success_when_the_database_fails(
        outage, client, admin, method, url, payload):
    call = getattr(client, method)
    res = call(url, json=payload) if payload is not None else call(url)

    assert res.is_json, f'{method.upper()} {url} did not answer with JSON'

    if url in DEGRADE_TO_200:
        # Deliberate. forgot-password always answers 200 so the form cannot be
        # used to find out which addresses are registered; the AI endpoints are
        # optional help, and an error there must not block someone from writing.
        assert res.status_code == 200
    else:
        assert res.status_code >= 400, f'{method.upper()} {url} reported success'


def test_the_health_check_still_answers_during_an_outage(outage, client):
    """A liveness probe that needs the database cannot distinguish the two."""
    assert client.get('/api/health').status_code == 200


def test_every_failure_label_names_the_function_it_is_in():
    """
    `failure()` writes its first argument to the log; it is the only thing that
    says where the exception came from. Two of these ended up swapped, so a
    failure in fetch_posts logged as create_post — which sends whoever is
    debugging to the wrong function while the real one looks innocent.

    Checked by reading the source rather than by keeping a list, so a service
    added later is covered without anyone remembering to come back here.
    """
    import ast
    import pathlib

    services = pathlib.Path(__file__).resolve().parents[1] / 'app' / 'services'
    wrong = []

    for path in sorted(services.glob('*.py')):
        tree = ast.parse(path.read_text(encoding='utf-8'))
        for cls in (n for n in tree.body if isinstance(n, ast.ClassDef)):
            for func in (n for n in cls.body if isinstance(n, ast.FunctionDef)):
                for node in ast.walk(func):
                    if isinstance(node, ast.Call) and getattr(node.func, 'id', '') == 'failure':
                        label = node.args[0].value
                        expected = f'{path.stem}.{func.name}'
                        if label != expected:
                            wrong.append(f'{label!r} is inside {expected}')

    assert not wrong, 'mislabelled failure() calls: ' + '; '.join(wrong)
