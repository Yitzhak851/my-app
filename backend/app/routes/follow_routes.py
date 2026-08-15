from flask import Blueprint, jsonify, request

from app.services import FollowService
from app.utils.auth import current_user, login_required

follow_bp = Blueprint('follows', __name__, url_prefix='/api/follows')


def _target_id(data):
    """The user being followed. Accepts the historical field names."""
    if not data:
        return None
    value = data.get('following_id', data.get('followingId'))
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@follow_bp.route('/', methods=['POST'])
@login_required
def follow_user():
    """
    Follow someone.

    The follower is always the signed-in user. A `follower_id` in the body is
    ignored — accepting it let anyone force user A to follow user B.
    """
    try:
        following_id = _target_id(request.get_json(silent=True))
        if following_id is None:
            return jsonify({'error': 'following_id is required'}), 400

        result = FollowService.follow_user(current_user()['id'], following_id)
        if result['success']:
            return jsonify({'message': result['message']}), 201
        return jsonify({'error': result['error']}), 400

    except Exception:
        return jsonify({'error': 'Could not follow this user'}), 500


@follow_bp.route('/', methods=['DELETE'])
@login_required
def unfollow_user():
    """Unfollow someone. The follower is the signed-in user."""
    try:
        following_id = _target_id(request.get_json(silent=True))
        if following_id is None:
            return jsonify({'error': 'following_id is required'}), 400

        result = FollowService.unfollow_user(current_user()['id'], following_id)
        if result['success']:
            return jsonify({'message': result['message']}), 200
        return jsonify({'error': result['error']}), 400

    except Exception:
        return jsonify({'error': 'Could not unfollow this user'}), 500


@follow_bp.route('/check', methods=['GET'])
@login_required
def check_if_following():
    """Is the signed-in user following `following_id`?"""
    try:
        following_id = request.args.get('following_id', None, type=int)
        if following_id is None:
            return jsonify({'error': 'following_id is required'}), 400

        result = FollowService.check_if_following(current_user()['id'], following_id)
        if result['success']:
            return jsonify({'is_following': result['is_following']}), 200
        return jsonify({'error': 'Could not check follow status'}), 500

    except Exception:
        return jsonify({'error': 'Could not check follow status'}), 500


@follow_bp.route('/<int:user_id>/followers', methods=['GET'])
def get_followers(user_id):
    """Public: who follows this user."""
    try:
        result = FollowService.get_followers(user_id)
        if result['success']:
            return jsonify(result['followers']), 200
        return jsonify({'error': 'Could not load followers'}), 500
    except Exception:
        return jsonify({'error': 'Could not load followers'}), 500


@follow_bp.route('/<int:user_id>/following', methods=['GET'])
def get_following(user_id):
    """Public: who this user follows."""
    try:
        result = FollowService.get_following(user_id)
        if result['success']:
            return jsonify(result['following']), 200
        return jsonify({'error': 'Could not load following'}), 500
    except Exception:
        return jsonify({'error': 'Could not load following'}), 500
