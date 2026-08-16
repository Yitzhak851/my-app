"""
Reporting for everyone, the moderation queue for moderators, user
administration for admins (course requirement 2.e).
"""
from flask import Blueprint, jsonify, request

from app.services.comments_service import CommentsService
from app.services.moderation_service import VALID_REASONS, ModerationService
from app.utils.auth import admin_required, current_user, login_required, moderator_required

moderation_bp = Blueprint('moderation', __name__, url_prefix='/api')


# ────────────────────────────────────────────── anyone signed in ────────────

@moderation_bp.route('/reports', methods=['POST'])
@login_required
def create_report():
    """Flag a post or a comment for review."""
    try:
        data = request.get_json(silent=True) or {}
        result = ModerationService.report(
            reporter_id=current_user()['id'],
            reason=data.get('reason'),
            post_id=data.get('post_id'),
            comment_id=data.get('comment_id'),
        )
        if result['success']:
            return jsonify({
                'message': 'Thanks — a moderator will take a look.',
                'already_reported': result.get('already_reported', False),
            }), 201
        return jsonify({'error': result['error']}), result.get('status', 400)
    except Exception:
        return jsonify({'error': 'Could not submit the report'}), 500


@moderation_bp.route('/reports/reasons', methods=['GET'])
def report_reasons():
    """The reasons the UI offers, so the list lives in one place."""
    return jsonify([{'value': k, 'label': v} for k, v in VALID_REASONS.items()]), 200


# ──────────────────────────────────────────────────── moderators ────────────

@moderation_bp.route('/moderation/queue', methods=['GET'])
@moderator_required
def moderation_queue():
    try:
        status = request.args.get('status', 'open')
        return jsonify(ModerationService.queue(status)['reports']), 200
    except Exception:
        return jsonify({'error': 'Could not load the queue'}), 500


@moderation_bp.route('/moderation/flagged', methods=['GET'])
@moderator_required
def flagged_content():
    """Content held automatically by the sentiment scorer."""
    try:
        result = ModerationService.auto_flagged()
        return jsonify({'posts': result['posts'], 'comments': result['comments']}), 200
    except Exception:
        return jsonify({'error': 'Could not load flagged content'}), 500


@moderation_bp.route('/moderation/reports/<int:report_id>', methods=['PATCH'])
@moderator_required
def resolve_report(report_id):
    try:
        data = request.get_json(silent=True) or {}
        result = ModerationService.resolve(report_id, current_user()['id'], data.get('action'))
        if result['success']:
            return jsonify({'message': 'Report closed'}), 200
        return jsonify({'error': result['error']}), result.get('status', 400)
    except Exception:
        return jsonify({'error': 'Could not update the report'}), 500


@moderation_bp.route('/moderation/posts/<int:post_id>', methods=['DELETE'])
@moderator_required
def moderator_delete_post(post_id):
    try:
        result = ModerationService.delete_post(post_id)
        if result['success']:
            return jsonify({'message': 'Post deleted'}), 200
        return jsonify({'error': result['error']}), result.get('status', 404)
    except Exception:
        return jsonify({'error': 'Could not delete the post'}), 500


@moderation_bp.route('/moderation/comments/<int:comment_id>', methods=['DELETE'])
@moderator_required
def moderator_delete_comment(comment_id):
    try:
        result = CommentsService.delete(comment_id, current_user())
        if result['success']:
            return jsonify({'message': 'Comment deleted'}), 200
        return jsonify({'error': result['error']}), result.get('status', 400)
    except Exception:
        return jsonify({'error': 'Could not delete the comment'}), 500


@moderation_bp.route('/moderation/flags/<kind>/<int:item_id>', methods=['DELETE'])
@moderator_required
def clear_flag(kind, item_id):
    """Dismiss an automatic flag without deleting anything."""
    try:
        result = ModerationService.clear_flag(kind, item_id)
        if result['success']:
            return jsonify({'message': 'Flag cleared'}), 200
        return jsonify({'error': result['error']}), result.get('status', 400)
    except Exception:
        return jsonify({'error': 'Could not clear the flag'}), 500


@moderation_bp.route('/moderation/users', methods=['GET'])
@moderator_required
def list_users_for_moderation():
    """Includes email and ban state — moderators need both to do the job."""
    try:
        search = request.args.get('search', '')
        return jsonify(ModerationService.list_users(search)['users']), 200
    except Exception:
        return jsonify({'error': 'Could not load users'}), 500


@moderation_bp.route('/moderation/users/<int:user_id>/ban', methods=['POST'])
@moderator_required
def set_ban(user_id):
    try:
        data = request.get_json(silent=True) or {}
        result = ModerationService.set_ban(current_user(), user_id, bool(data.get('banned', True)))
        if result['success']:
            return jsonify({'is_banned': result['is_banned']}), 200
        return jsonify({'error': result['error']}), result.get('status', 400)
    except Exception:
        return jsonify({'error': 'Could not update the account'}), 500


# ───────────────────────────────────────────────────────── admins ───────────

@moderation_bp.route('/moderation/users/<int:user_id>/role', methods=['POST'])
@admin_required
def set_role(user_id):
    """Only an admin may hand out moderator or admin rights."""
    try:
        data = request.get_json(silent=True) or {}
        result = ModerationService.set_role(current_user(), user_id, data.get('role'))
        if result['success']:
            return jsonify({'role': result['role']}), 200
        return jsonify({'error': result['error']}), result.get('status', 400)
    except Exception:
        return jsonify({'error': 'Could not change the role'}), 500
