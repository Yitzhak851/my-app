"""
The database layer itself.

Everywhere else in this suite the database is replaced by an in-memory fake, so
`app/utils/db.py` — the one module every other module depends on — was the least
tested file in the project (30%). It is also where the worst bug of the whole
project lived: a single shared connection that produced

    2014 (HY000): Commands out of sync; you can't run this command now

as soon as two requests overlapped.

These tests drive the real `Database` class against a fake mysql-connector, so
the pooling behaviour, the retry, the cursor flags and the cleanup are all
asserted rather than assumed.
"""
import threading

import pytest
from mysql.connector import Error
from mysql.connector import pooling

from app import create_app
from app.utils import db as db_module
from app.utils.db import Database


# ──────────────────────────────────────────────── a fake mysql-connector ─────

class FakeCursor:
    def __init__(self, connection, dictionary=False, buffered=False):
        self.connection = connection
        self.dictionary = dictionary
        self.buffered = buffered
        self.closed = False
        self.lastrowid = 0
        self._rows = []

    def execute(self, sql, params=()):
        self.connection.statements.append((sql, params))
        if self.connection.raise_on_execute:
            raise self.connection.raise_on_execute
        self._rows = list(self.connection.rows)
        self.lastrowid = self.connection.lastrowid

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows

    def close(self):
        self.closed = True


class FakeConnection:
    def __init__(self, pool):
        self.pool = pool
        self.statements = []
        self.cursors = []
        self.rows = [{'id': 1}]
        self.lastrowid = 0
        self.raise_on_execute = None
        self.raise_on_rollback = None
        self.committed = 0
        self.rolled_back = 0
        self.returned_to_pool = False

    def cursor(self, dictionary=False, buffered=False):
        c = FakeCursor(self, dictionary=dictionary, buffered=buffered)
        self.cursors.append(c)
        return c

    def commit(self):
        self.committed += 1

    def rollback(self):
        self.rolled_back += 1
        if self.raise_on_rollback:
            raise self.raise_on_rollback

    def close(self):
        # A pooled connection is not disconnected by close() — it goes back.
        self.returned_to_pool = True
        self.pool.checked_in.append(self)


class FakePool:
    """Stands in for mysql.connector.pooling.MySQLConnectionPool."""

    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.handed_out = []
        self.checked_in = []
        self.fail_times = 0          # raise PoolError this many times first
        self.calls = 0
        FakePool.instances.append(self)

    def get_connection(self):
        self.calls += 1
        if self.fail_times > 0:
            self.fail_times -= 1
            raise pooling.PoolError('pool exhausted')
        conn = FakeConnection(self)
        self.handed_out.append(conn)
        return conn


@pytest.fixture
def pool(monkeypatch):
    """Real Database, fake driver. Returns the pool the app ends up using."""
    FakePool.instances.clear()
    monkeypatch.setattr(Database, '_pool', None)
    monkeypatch.setattr(Database, '_lock', threading.Lock())
    monkeypatch.setattr(db_module.pooling, 'MySQLConnectionPool', FakePool)
    monkeypatch.setattr(db_module.time, 'sleep', lambda _s: None)

    application = create_app()
    with application.app_context():
        yield Database._get_pool()


# ─────────────────────────────────────────────────────── pool creation ───────

def test_the_pool_is_created_once_and_reused(pool):
    assert len(FakePool.instances) == 1

    Database._get_pool()
    Database._get_pool()

    assert len(FakePool.instances) == 1, 'a second pool would double the connections'


def test_the_pool_is_configured_from_app_config(pool):
    kwargs = pool.kwargs

    assert kwargs['pool_size'] == Database.POOL_SIZE
    assert kwargs['database'] == 'social_app_test', 'must read the app config, not a default'
    assert kwargs['autocommit'] is True
    assert kwargs['pool_reset_session'] is True, \
        'a recycled connection must not inherit the previous caller state'


def test_a_failure_to_create_the_pool_is_raised_not_swallowed(monkeypatch):
    """Starting with an unreachable database must fail loudly, not silently."""
    monkeypatch.setattr(Database, '_pool', None)

    def explode(**_kwargs):
        raise Error('Access denied for user')

    monkeypatch.setattr(db_module.pooling, 'MySQLConnectionPool', explode)

    application = create_app()
    with application.app_context():
        with pytest.raises(Error):
            Database._get_pool()


# ─────────────────────────────────────────────────── borrowing and retry ─────

def test_get_connection_retries_when_the_pool_is_momentarily_empty(pool):
    """
    mysql-connector raises immediately instead of waiting for a free connection.
    Connections are held for a single statement, so a brief retry is enough.
    """
    pool.fail_times = 3

    conn = Database.get_connection()

    assert conn is not None
    assert pool.calls == 4, 'should have retried, not given up on the first refusal'


def test_get_connection_gives_up_after_the_configured_attempts(pool):
    pool.fail_times = 999

    with pytest.raises(pooling.PoolError):
        Database.get_connection()

    assert pool.calls == Database.POOL_ACQUIRE_ATTEMPTS


def test_close_connection_is_a_no_op(pool):
    """
    Teardown used to close a process-wide shared connection, which could
    disconnect a connection another thread was still reading from.
    """
    assert Database.close_connection() is None


# ─────────────────────────────────────────────────────────── queries ─────────

def test_execute_query_returns_all_rows_by_default(pool):
    rows = Database.execute_query('SELECT id FROM users')

    assert rows == [{'id': 1}]
    assert pool.handed_out[0].statements == [('SELECT id FROM users', ())]


def test_execute_query_fetch_one_returns_a_single_row(pool):
    conn_rows = [{'id': 7}, {'id': 8}]
    pool.get_connection = lambda: _prepared(pool, rows=conn_rows)

    assert Database.execute_query('SELECT id FROM users', (1,), fetch_one=True) == {'id': 7}


def test_execute_query_uses_a_dictionary_and_buffered_cursor(pool):
    """
    Both flags are load-bearing. Rows must be dicts because every service reads
    them by column name; unbuffered leaves unread rows on the connection and the
    next statement fails with 2014.
    """
    Database.execute_query('SELECT id FROM users')

    cursor = pool.handed_out[0].cursors[0]
    assert cursor.dictionary is True
    assert cursor.buffered is True


def test_a_query_returns_its_connection_to_the_pool(pool):
    Database.execute_query('SELECT id FROM users')

    conn = pool.handed_out[0]
    assert conn.returned_to_pool is True
    assert conn.cursors[0].closed is True


def test_a_failing_query_still_returns_its_connection(pool):
    """A leaked connection on the error path drains the pool one failure at a time."""
    def failing():
        return _prepared(pool, error=Error('syntax error'))

    pool.get_connection = failing

    with pytest.raises(Error):
        Database.execute_query('SELECT nonsense')

    assert pool.checked_in[-1].returned_to_pool is True
    assert pool.checked_in[-1].cursors[0].closed is True


# ─────────────────────────────────────────────────────────── updates ─────────

def test_execute_update_commits_and_returns_the_new_id(pool):
    pool.get_connection = lambda: _prepared(pool, lastrowid=42)

    assert Database.execute_update('INSERT INTO users (name) VALUES (%s)', ('a',)) == 42
    assert pool.checked_in[-1].committed == 1


def test_execute_update_returns_true_when_there_is_no_insert_id(pool):
    """DELETE and UPDATE have no lastrowid; callers still need a truthy result."""
    pool.get_connection = lambda: _prepared(pool, lastrowid=0)

    assert Database.execute_update('DELETE FROM likes WHERE id = %s', (1,)) is True


def test_a_failing_update_rolls_back_and_reraises(pool):
    pool.get_connection = lambda: _prepared(pool, error=Error('duplicate key'))

    with pytest.raises(Error):
        Database.execute_update('INSERT INTO users (email) VALUES (%s)', ('dup',))

    conn = pool.checked_in[-1]
    assert conn.rolled_back == 1
    assert conn.committed == 0
    assert conn.returned_to_pool is True


def test_a_rollback_that_itself_fails_does_not_mask_the_real_error(pool):
    """
    When the connection has already dropped, rollback fails too. The caller must
    still see the original error rather than a confusing one from the cleanup.
    """
    pool.get_connection = lambda: _prepared(
        pool, error=Error('the real problem'), rollback_error=Error('connection gone'))

    with pytest.raises(Error) as caught:
        Database.execute_update('UPDATE users SET name = %s', ('x',))

    assert 'the real problem' in str(caught.value)


def test_update_passes_an_empty_tuple_when_there_are_no_params(pool):
    Database.execute_update('DELETE FROM sessions WHERE expires_at <= NOW()')

    assert pool.handed_out[0].statements[0][1] == ()


# ──────────────────────────────────────────────────────── concurrency ────────

def test_parallel_operations_never_share_a_connection(pool):
    """
    The regression test for `2014 Commands out of sync`. Every concurrent
    operation must be handed its own connection object.
    """
    seen = []
    seen_lock = threading.Lock()
    original = pool.get_connection

    def tracked():
        conn = original()
        with seen_lock:
            seen.append(id(conn))
        return conn

    pool.get_connection = tracked

    threads = [threading.Thread(target=Database.execute_query, args=('SELECT id FROM users',))
               for _ in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(seen) == 20
    assert len(set(seen)) == 20, 'two operations were given the same connection'


# ──────────────────────────────────────────────────────────── helper ─────────

def _prepared(pool, rows=None, lastrowid=0, error=None, rollback_error=None):
    conn = FakeConnection(pool)
    conn.rows = rows if rows is not None else [{'id': 1}]
    conn.lastrowid = lastrowid
    conn.raise_on_execute = error
    conn.raise_on_rollback = rollback_error
    pool.handed_out.append(conn)
    return conn
