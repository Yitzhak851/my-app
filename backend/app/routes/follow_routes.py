from flask import Blueprint, request, jsonify
from app.services import FollowService

follow_bp = Blueprint('follows', __name__, url_prefix='/api/follows')


@follow_bp.route('/', methods=['POST'])
def follow_user():
    """Follow a user"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        follower_id = data.get('follower_id')
        following_id = data.get('following_id')
        
        if not follower_id or not following_id:
            return jsonify({'error': 'follower_id and following_id are required'}), 400
        
        result = FollowService.follow_user(follower_id, following_id)
        
        if result['success']:
            return jsonify({'message': result['message']}), 201
        else:
            return jsonify({'error': result['error']}), 400
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@follow_bp.route('/', methods=['DELETE'])
def unfollow_user():
    """Unfollow a user"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        follower_id = data.get('follower_id')
        following_id = data.get('following_id')
        
        if not follower_id or not following_id:
            return jsonify({'error': 'follower_id and following_id are required'}), 400
        
        result = FollowService.unfollow_user(follower_id, following_id)
        
        if result['success']:
            return jsonify({'message': result['message']}), 200
        else:
            return jsonify({'error': result['error']}), 400
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@follow_bp.route('/check', methods=['GET'])
def check_if_following():
    """Check if user is following another user"""
    try:
        follower_id = request.args.get('follower_id', None, type=int)
        following_id = request.args.get('following_id', None, type=int)
        
        if not follower_id or not following_id:
            return jsonify({'error': 'follower_id and following_id are required'}), 400
        
        result = FollowService.check_if_following(follower_id, following_id)
        
        if result['success']:
            return jsonify({'is_following': result['is_following']}), 200
        else:
            return jsonify({'error': result['error']}), 500
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@follow_bp.route('/<int:user_id>/followers', methods=['GET'])
def get_followers(user_id):
    """Get followers for a user"""
    try:
        result = FollowService.get_followers(user_id)
        
        if result['success']:
            return jsonify(result['followers']), 200
        else:
            return jsonify({'error': result['error']}), 500
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@follow_bp.route('/<int:user_id>/following', methods=['GET'])
def get_following(user_id):
    """Get users that a user is following"""
    try:
        result = FollowService.get_following(user_id)
        
        if result['success']:
            return jsonify(result['following']), 200
        else:
            return jsonify({'error': result['error']}), 500
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
