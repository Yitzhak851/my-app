from flask import Blueprint, request, jsonify
from app.services import AuthService

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@auth_bp.route('/signup', methods=['POST'])
def signup():
    """Register a new user"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        email = data.get('email')
        password = data.get('password')
        name = data.get('name')
        
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        result = AuthService.signup(email, password, name)
        
        if result['success']:
            return jsonify({
                'message': 'User created',
                'user': result['user']
            }), 201
        else:
            return jsonify({'error': result['error']}), 400
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    """Authenticate a user"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        result = AuthService.login(email, password)
        
        if result['success']:
            return jsonify({
                'message': 'Login successful',
                'user': result['user']
            }), 200
        else:
            return jsonify({'error': result['error']}), 401
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
