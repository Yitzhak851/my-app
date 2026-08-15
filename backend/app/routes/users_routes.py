from flask import Blueprint, request, jsonify
from app.services import UsersService

users_bp = Blueprint('users', __name__, url_prefix='/api/users')


@users_bp.route('/', methods=['GET'])
def fetch_users():
    """Fetch users with optional search"""
    try:
        start = request.args.get('start', 0, type=int)
        limit = request.args.get('limit', 10, type=int)
        search = request.args.get('search', '', type=str)
        
        result = UsersService.fetch_users(start=start, limit=limit, search=search)
        
        if result['success']:
            return jsonify(result['users']), 200
        else:
            return jsonify({'error': result['error']}), 500
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@users_bp.route('/<int:user_id>', methods=['GET'])
def get_user(user_id):
    """Get user by ID"""
    try:
        result = UsersService.get_user_by_id(user_id)
        
        if result['success']:
            return jsonify(result['user']), 200
        else:
            return jsonify({'error': result['error']}), 404
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@users_bp.route('/<int:user_id>/follow-stats', methods=['GET'])
def get_follow_stats(user_id):
    """Get follow statistics for a user"""
    try:
        result = UsersService.get_user_follow_stats(user_id)
        
        if result['success']:
            return jsonify({
                'followers': result['followers'],
                'following': result['following'],
                'posts': result['posts']
            }), 200
        else:
            return jsonify({'error': result['error']}), 500
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
