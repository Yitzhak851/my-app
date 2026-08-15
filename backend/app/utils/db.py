import threading
import time

import mysql.connector
from mysql.connector import Error, pooling
from flask import current_app


class Database:
    """
    Database access built on a connection pool.

    Why a pool and not one shared connection:

    A MySQL connection is a single conversation. It can carry exactly one
    statement at a time, and the client must read every row of a result before
    sending the next statement. The Flask development server is threaded, so
    concurrent requests run in parallel — the profile page alone fires three
    (user, follow stats, posts). Sharing one connection between those threads
    interleaves their statements on the same socket and MySQL rejects it with:

        2014 (HY000): Commands out of sync; you can't run this command now

    The pool gives each operation its own connection for the duration of that
    operation and takes it back afterwards, so two threads can never share one.

    Cursors are also created buffered. An unbuffered cursor leaves unread rows
    on the connection when only some are consumed (fetch_one on a multi-row
    result), and the next statement on that connection fails with the same 2014.
    Buffering reads the whole result up front, which removes that state entirely.
    """

    _pool = None
    _lock = threading.Lock()

    # Flask's threaded dev server has no fixed worker count; 10 comfortably
    # covers the parallel calls a single page makes, with headroom.
    POOL_SIZE = 10

    # A borrowed connection is held only for one statement, so waiting briefly
    # beats failing the request outright.
    POOL_ACQUIRE_ATTEMPTS = 5

    @classmethod
    def _get_pool(cls):
        """Create the pool on first use (double-checked so it happens once)."""
        if cls._pool is None:
            with cls._lock:
                if cls._pool is None:
                    try:
                        cls._pool = pooling.MySQLConnectionPool(
                            pool_name='ybo_pool',
                            pool_size=cls.POOL_SIZE,
                            pool_reset_session=True,
                            host=current_app.config['DB_HOST'],
                            user=current_app.config['DB_USER'],
                            password=current_app.config['DB_PASSWORD'],
                            database=current_app.config['DB_NAME'],
                            autocommit=True,
                        )
                        print(f"MySQL connection pool created (size {cls.POOL_SIZE})")
                    except Error as e:
                        print(f"Error while creating the MySQL connection pool: {e}")
                        raise
        return cls._pool

    @staticmethod
    def get_connection():
        """
        Borrow a connection from the pool.

        The caller MUST close it when finished — closing a pooled connection
        returns it to the pool rather than disconnecting. Prefer execute_query
        and execute_update, which handle this for you.

        mysql-connector raises immediately when the pool is empty instead of
        waiting, so a short burst of traffic could fail for no good reason.
        Connections are held only for the length of one statement, so a brief
        retry is almost always enough.
        """
        pool = Database._get_pool()
        last_error = None
        for attempt in range(Database.POOL_ACQUIRE_ATTEMPTS):
            try:
                return pool.get_connection()
            except pooling.PoolError as e:
                last_error = e
                time.sleep(0.05 * (attempt + 1))
        print(f"Could not get a connection from the pool: {last_error}")
        raise last_error

    @classmethod
    def close_connection(cls):
        """
        Kept for backward compatibility.

        Pooled connections are returned automatically, so per-request teardown
        has nothing to do. Closing a shared connection here used to be actively
        harmful: one request could close the connection another thread was still
        reading from.
        """
        return None

    @staticmethod
    def execute_query(sql, params=None, fetch_one=False):
        """Run a SELECT and return the rows (or a single row)."""
        connection = Database.get_connection()
        cursor = connection.cursor(dictionary=True, buffered=True)
        try:
            cursor.execute(sql, params or ())
            return cursor.fetchone() if fetch_one else cursor.fetchall()
        except Error as e:
            print(f"Error executing query: {e}")
            raise
        finally:
            cursor.close()
            connection.close()  # returns it to the pool

    @staticmethod
    def execute_update(sql, params=None):
        """Run an INSERT, UPDATE or DELETE. Returns lastrowid when there is one."""
        connection = Database.get_connection()
        cursor = connection.cursor(buffered=True)
        try:
            cursor.execute(sql, params or ())
            connection.commit()
            return cursor.lastrowid if cursor.lastrowid else True
        except Error as e:
            try:
                connection.rollback()
            except Error:
                pass
            print(f"Error executing update: {e}")
            raise
        finally:
            cursor.close()
            connection.close()  # returns it to the pool
