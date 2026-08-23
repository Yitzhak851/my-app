"""
Public user directory.

Every response here is readable without signing in, so two rules apply
throughout: the projection never includes an email address (see
`UsersService.PUBLIC_COLUMNS`), and a failure never echoes the exception text —
driver messages quote the SQL, and the SQL names the columns.
"""
from flask import Blueprint, request, jsonify

from app.services import SuggestionsService, UsersService
from app.utils.auth import current_user, login_required

users_bp = Blueprint('users', __name__, url_prefix='/api/users')

# Cap on how many rows one request can ask for. Without it, `?limit=1000000`
# is a free way to pull the whole user table in a single call.
MAX_LIMIT = 100


@users_bp.route('/', methods=['GET'])
def fetch_users():
    """List users, optionally filtered by name."""
    try:
        start = max(request.args.get('start', 0, type=int) or 0, 0)
        limit = request.args.get('limit', 10, type=int) or 10
        limit = min(max(limit, 1), MAX_LIMIT)
        search = request.args.get('search', '', type=str)

        result = UsersService.fetch_users(start=start, limit=limit, search=search)

        if result['success']:
            return jsonify(result['users']), 200
        print(f"users: fetch failed: {result['error']}", flush=True)
        return jsonify({'error': 'Could not load users'}), 500

    except Exception:
        return jsonify({'error': 'Could not load users'}), 500


@users_bp.route('/suggestions', methods=['GET'])
@login_required
def suggested_users():
    """
    Who this user might want to follow (optional requirement 3.e.i).

    Signed-in only, and always for the session's user: suggestions are built
    from who you follow, so accepting a user id here would let anyone read the
    shape of somebody else's social graph.

    Declared before /<int:user_id> for readability only — the converter means
    "suggestions" could never match that rule anyway.
    """
    try:
        result = SuggestionsService.for_user(
            current_user()['id'], request.args.get('limit', type=int))

        if result['success']:
            return jsonify(result['suggestions']), 200
        print(f"users: suggestions failed: {result['error']}", flush=True)
        return jsonify({'error': 'Could not load suggestions'}), 500

    except Exception:
        return jsonify({'error': 'Could not load suggestions'}), 500


@users_bp.route('/<int:user_id>', methods=['GET'])
def get_user(user_id):
    """A single public profile."""
    try:
        result = UsersService.get_user_by_id(user_id)

        if result['success']:
            return jsonify(result['user']), 200
        # 'User not found' is safe to pass through; anything else is not.
        if result['error'] == 'User not found':
            return jsonify({'error': 'User not found'}), 404
        print(f'users: lookup failed: {result["error"]}', flush=True)
        return jsonify({'error': 'Could not load this user'}), 500

    except Exception:
        return jsonify({'error': 'Could not load this user'}), 500


@users_bp.route('/<int:user_id>/follow-stats', methods=['GET'])
def get_follow_stats(user_id):
    """Follower, following and post counts for a profile header."""
    try:
        result = UsersService.get_user_follow_stats(user_id)

        if result['success']:
            return jsonify({
                'followers': result['followers'],
                'following': result['following'],
                'posts': result['posts'],
            }), 200
        print(f"users: follow-stats failed: {result['error']}", flush=True)
        return jsonify({'error': 'Could not load these statistics'}), 500

    except Exception:
        return jsonify({'error': 'Could not load these statistics'}), 500
