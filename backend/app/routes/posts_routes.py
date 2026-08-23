from flask import Blueprint, jsonify, request

from app.services import PostsService
from app.utils.auth import current_user, login_required

posts_bp = Blueprint('posts', __name__, url_prefix='/api/posts')

# The same cap the user directory has. Without it `?limit=1000000` pulls every
# post, with every author joined on, in a single request — the cheapest way
# there is to make the server do a lot of work for one client.
MAX_LIMIT = 100


@posts_bp.route('/', methods=['GET'])
def fetch_posts():
    """
    Fetch posts.

    Reading is open to everyone, so the global feed works signed out.
    The "following only" feed is per-person, so its user comes from the
    session — a client-supplied currentUserId would let anyone read anyone
    else's personalised feed.
    """
    try:
        start = max(request.args.get('start', 0, type=int) or 0, 0)
        limit = request.args.get('limit', 10, type=int) or 10
        limit = min(max(limit, 1), MAX_LIMIT)
        user_id = request.args.get('userId', None, type=int)
        following_only = request.args.get('followingOnly', 'false').lower() == 'true'

        current = current_user()

        if following_only and current is None:
            return jsonify({'error': 'Authentication required'}), 401

        result = PostsService.fetch_posts(
            start=start,
            limit=limit,
            user_id=user_id,
            following_only=following_only,
            current_user_id=current['id'] if current else None,
        )

        if result['success']:
            return jsonify(result['posts']), 200
        return jsonify({'error': 'Could not load posts'}), 500

    except Exception:
        return jsonify({'error': 'Could not load posts'}), 500


@posts_bp.route('/', methods=['POST'])
@login_required
def create_post():
    """
    Create a post owned by the signed-in user.

    The author is taken from the session and any `userId` in the body is
    ignored. Previously this endpoint wrote whatever user id the client sent,
    so anyone could publish under someone else's name.
    """
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        result = PostsService.create_post(
            user_id=current_user()['id'],
            title=data.get('title'),
            body=data.get('body'),
            image_url=data.get('image_url'),
        )

        if result['success']:
            return jsonify({'message': result['message'], 'post': result['post']}), 201
        return jsonify({'error': result['error']}), 400

    except Exception:
        return jsonify({'error': 'Could not create the post'}), 500
