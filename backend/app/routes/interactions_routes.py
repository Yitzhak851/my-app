"""
Likes and comments — the two social interactions from requirement 2.b.

Both are nested under the post they belong to, which keeps the URLs describing
the data rather than the implementation.
"""
from flask import Blueprint, jsonify, request

from app.services.comments_service import CommentsService
from app.services.likes_service import LikesService
from app.utils.auth import current_user, login_required

interactions_bp = Blueprint('interactions', __name__, url_prefix='/api')


# ─────────────────────────────────────────────────────────────── likes ──────

@interactions_bp.route('/posts/<int:post_id>/like', methods=['POST'])
@login_required
def like_post(post_id):
    """Like a post. Liking twice is a no-op, not an error."""
    try:
        result = LikesService.like(current_user()['id'], post_id)
        if result['success']:
            return jsonify({'liked': result['liked'], 'count': result['count']}), 200
        return jsonify({'error': result['error']}), result.get('status', 400)
    except Exception:
        return jsonify({'error': 'Could not like this post'}), 500


@interactions_bp.route('/posts/<int:post_id>/like', methods=['DELETE'])
@login_required
def unlike_post(post_id):
    """Remove your like."""
    try:
        result = LikesService.unlike(current_user()['id'], post_id)
        if result['success']:
            return jsonify({'liked': result['liked'], 'count': result['count']}), 200
        return jsonify({'error': result['error']}), result.get('status', 400)
    except Exception:
        return jsonify({'error': 'Could not remove the like'}), 500


# ──────────────────────────────────────────────────────────── comments ──────

@interactions_bp.route('/posts/<int:post_id>/comments', methods=['GET'])
def list_comments(post_id):
    """Comments are public, like the posts they belong to."""
    try:
        result = CommentsService.list_for_post(post_id)
        return jsonify(result['comments']), 200
    except Exception:
        return jsonify({'error': 'Could not load comments'}), 500


@interactions_bp.route('/posts/<int:post_id>/comments', methods=['POST'])
@login_required
def create_comment(post_id):
    """Add a comment. The author is the signed-in user."""
    try:
        data = request.get_json(silent=True) or {}
        result = CommentsService.create(
            user_id=current_user()['id'],
            post_id=post_id,
            body=data.get('body'),
            parent_id=data.get('parent_id'),
        )
        if result['success']:
            # Tell the author their comment was held for review. Hiding it would
            # leave them wondering why nobody replied.
            return jsonify({
                'comment': result['comment'],
                'flagged': result.get('flagged', False),
            }), 201
        return jsonify({'error': result['error']}), result.get('status', 400)
    except Exception:
        return jsonify({'error': 'Could not post the comment'}), 500


@interactions_bp.route('/comments/<int:comment_id>', methods=['DELETE'])
@login_required
def delete_comment(comment_id):
    """Delete your own comment. Moderators may delete anyone's."""
    try:
        result = CommentsService.delete(comment_id, current_user())
        if result['success']:
            return jsonify({'message': 'Comment deleted'}), 200
        return jsonify({'error': result['error']}), result.get('status', 400)
    except Exception:
        return jsonify({'error': 'Could not delete the comment'}), 500
