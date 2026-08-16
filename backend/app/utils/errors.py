"""
One way to fail.

Services report failure as `{'success': False, 'error': ...}` and routes hand
that `error` straight to the client. That is fine for a message written for a
person — "Cannot follow yourself" — and dangerous for `str(exception)`: a MySQL
error quotes the statement that failed, and the statement names the tables and
columns. Several endpoints used to answer a database outage with

    {"error": "1054 (42S22): Unknown column 'users.x' in 'field list'"}

which hands out the schema to anyone who can make a request fail.

`failure()` keeps both halves: the real cause goes to the server log, where it
is needed for debugging, and the caller gets a sentence that is safe to display.
"""


def failure(where, exception, message):
    """Log the real cause; return a service result safe to show a user."""
    print(f'{where}: {exception!r}', flush=True)
    return {'success': False, 'error': message}
