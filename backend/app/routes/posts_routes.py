from flask import Blueprint, request, jsonify
from app.services import PostsService

posts_bp = Blueprint('posts', __name__, url_prefix='/api/posts')


@posts_bp.route('/', methods=['GET'])
def fetch_posts():
    """Fetch posts with optional filters"""
    try:
        start = request.args.get('start', 0, type=int)
        limit = request.args.get('limit', 10, type=int)
        user_id = request.args.get('userId', None, type=int)
        following_only = request.args.get('followingOnly', 'false').lower() == 'true'
        current_user_id = request.args.get('currentUserId', None, type=int)
        
        result = PostsService.fetch_posts(
            start=start,
            limit=limit,
            user_id=user_id,
            following_only=following_only,
            current_user_id=current_user_id
        )
        
        if result['success']:
            return jsonify(result['posts']), 200
        else:
            return jsonify({'error': result['error']}), 500
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@posts_bp.route('/', methods=['POST'])
def create_post():
    """Create a new post"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        user_id = data.get('userId')
        title = data.get('title')
        body = data.get('body')
        image_url = data.get('image_url')
        
        result = PostsService.create_post(user_id, title, body, image_url)
        
        if result['success']:
            return jsonify({
                'message': result['message'],
                'post': result['post']
            }), 201
        else:
            return jsonify({'error': result['error']}), 400
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
