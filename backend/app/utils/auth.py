"""
Request-level authentication: who is making this call, and may they.

The rule this module exists to enforce: **identity comes from the session
cookie, never from the request body**. Before this, endpoints trusted fields
like `userId` and `follower_id` sent by the client, so anyone could post as
anyone with a single curl command.
"""
from functools import wraps

from flask import current_app, g, jsonify, request

from app.services.session_service import SessionService

COOKIE_NAME = 'session_id'


def current_user():
    """
    The signed-in user for this request, or None.

    Cached on `g` so several decorators and the view itself do not each hit the
    database for the same lookup.
    """
    if 'current_user' not in g:
        g.current_user = SessionService.get_user(request.cookies.get(COOKIE_NAME))
    return g.current_user


def login_required(view):
    """Reject the request with 401 unless a valid session cookie is present."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            return jsonify({'error': 'Authentication required'}), 401
        return view(*args, **kwargs)
    return wrapper


def roles_required(*roles):
    """
    Require a signed-in user holding one of `roles`.

    401 means "you are not signed in", 403 means "you are, but not allowed" —
    the client needs to tell those apart to decide between showing a login form
    and showing an error.
    """
    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            user = current_user()
            if user is None:
                return jsonify({'error': 'Authentication required'}), 401
            if user.get('role') not in roles:
                return jsonify({'error': 'Insufficient permissions'}), 403
            return view(*args, **kwargs)
        return wrapper
    return decorator


admin_required = roles_required('admin')
moderator_required = roles_required('admin', 'moderator')


def set_session_cookie(response, session_id, expires_at):
    """
    Attach the session cookie.

    httponly   — JavaScript cannot read it, so an XSS bug cannot steal the session.
    samesite   — Lax stops another site from using the cookie on cross-site POSTs.
    secure     — HTTPS only. Off in development because localhost is plain HTTP;
                 driven by config so production turns it on.
    """
    response.set_cookie(
        COOKIE_NAME,
        session_id,
        expires=expires_at,
        httponly=True,
        samesite=current_app.config.get('SESSION_COOKIE_SAMESITE', 'Lax'),
        secure=current_app.config.get('SESSION_COOKIE_SECURE', False),
        path='/',
    )
    return response


def clear_session_cookie(response):
    """Remove the cookie. The attributes must match the ones it was set with."""
    response.delete_cookie(
        COOKIE_NAME,
        path='/',
        httponly=True,
        samesite=current_app.config.get('SESSION_COOKIE_SAMESITE', 'Lax'),
        secure=current_app.config.get('SESSION_COOKIE_SECURE', False),
    )
    return response
