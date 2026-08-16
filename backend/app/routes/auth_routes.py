from flask import Blueprint, jsonify, make_response, request

from app.services import AuthService
from app.services.password_reset_service import PasswordResetService
from app.services.session_service import SessionService
from app.utils.auth import (
    COOKIE_NAME,
    clear_session_cookie,
    current_user,
    login_required,
    set_session_cookie,
)

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


def _sign_in(user):
    """Create a session for `user` and return a response carrying its cookie."""
    session_id, expires_at = SessionService.create(user['id'])
    response = make_response(jsonify({'message': 'Login successful', 'user': user}))
    return set_session_cookie(response, session_id, expires_at), 200


@auth_bp.route('/signup', methods=['POST'])
def signup():
    """Register a new user and sign them in."""
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        email = data.get('email')
        password = data.get('password')
        name = data.get('name')

        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400

        result = AuthService.signup(email, password, name)
        if not result['success']:
            return jsonify({'error': result['error']}), 400

        session_id, expires_at = SessionService.create(result['user']['id'])
        response = make_response(
            jsonify({'message': 'User created', 'user': result['user']})
        )
        return set_session_cookie(response, session_id, expires_at), 201

    except Exception:
        # The message is deliberately generic: exception text can leak SQL and
        # driver internals to the client.
        return jsonify({'error': 'Could not create the account'}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    """Authenticate and start a session."""
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400

        result = AuthService.login(email, password)
        if not result['success']:
            return jsonify({'error': result['error']}), 401

        return _sign_in(result['user'])

    except Exception:
        return jsonify({'error': 'Could not sign in'}), 500


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """
    End the session server-side and clear the cookie.

    Deliberately succeeds even without a valid session, so a client holding a
    stale cookie can always reach a signed-out state.
    """
    try:
        SessionService.destroy(request.cookies.get(COOKIE_NAME))
        response = make_response(jsonify({'message': 'Logged out'}))
        return clear_session_cookie(response), 200
    except Exception:
        return jsonify({'error': 'Could not log out'}), 500


@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    """
    Start a password reset.

    Always answers 200 with the same message, whether or not the address has an
    account. Reporting "no such user" would let anyone use this form to find out
    who is registered.
    """
    try:
        data = request.get_json(silent=True) or {}
        PasswordResetService.request_reset(data.get('email'))
    except Exception:
        # Even a failure is not reported back, for the same reason.
        pass

    return jsonify({
        'message': 'If that address has an account, a reset link is on its way.'
    }), 200


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """Finish a password reset using the emailed token."""
    try:
        data = request.get_json(silent=True) or {}
        result = PasswordResetService.reset(data.get('token'), data.get('password'))

        if result['success']:
            return jsonify({'message': 'Your password has been changed. Please sign in.'}), 200
        return jsonify({'error': result['error']}), result.get('status', 400)
    except Exception:
        return jsonify({'error': 'Could not reset the password'}), 500


@auth_bp.route('/me', methods=['GET'])
@login_required
def me():
    """
    Who the session cookie belongs to.

    The frontend calls this on load instead of trusting its own localStorage,
    so a session revoked on the server takes effect on the next page load.
    """
    return jsonify({'user': current_user()}), 200
