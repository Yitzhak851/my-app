from flask import Flask
from flask_cors import CORS
from app.config import get_config
from app.routes import auth_bp, posts_bp, users_bp, follow_bp, upload_bp


def create_app():
    """Create and configure Flask application"""
    app = Flask(__name__)

    # Accept both /api/posts and /api/posts/ as the same endpoint.
    #
    # By default Flask answers a request for /api/posts with a 308 redirect to
    # /api/posts/. A browser follows that happily for a plain GET, but a POST
    # carrying Content-Type: application/json is a *preflighted* CORS request,
    # and the fetch spec forbids following a redirect after a preflight. The
    # request dies in the browser as an opaque "TypeError: Failed to fetch" with
    # nothing useful in the server log — the feed loads fine while creating a
    # post fails, which points the finger at entirely the wrong place.
    #
    # This must be set before the blueprints are registered: the value is read
    # as each URL rule is added.
    app.url_map.strict_slashes = False

    # Load configuration
    config = get_config()
    app.config.from_object(config)
    
    # Setup CORS
    # supports_credentials is what allows the browser to send the session
    # cookie on cross-origin calls (the dev frontend is :5173, the API :5000).
    # It also forbids a wildcard origin, which is why CORS_ORIGINS must list
    # real origins.
    CORS(app, resources={
        r"/api/*": {
            "origins": app.config['CORS_ORIGINS'],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type"],
            "supports_credentials": True,
        }
    })
    
    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(posts_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(follow_bp)
    app.register_blueprint(upload_bp)
    
    # Health check endpoint
    @app.route('/')
    def health_check():
        return {'message': 'Server is working'}, 200
    
    @app.route('/api/health')
    def api_health_check():
        return {'message': 'API is working'}, 200
    
    # Error handlers
    @app.errorhandler(404)
    def not_found(error):
        return {'error': 'Resource not found'}, 404
    
    @app.errorhandler(413)
    def payload_too_large(error):
        limit_mb = app.config['MAX_CONTENT_LENGTH'] // (1024 * 1024)
        return {'error': f'The upload is too large (limit {limit_mb} MB)'}, 413

    @app.errorhandler(500)
    def internal_error(error):
        return {'error': 'Internal server error'}, 500
    
    # Connections come from a pool and are returned by the code that borrowed
    # them, so there is nothing to tear down per request. The previous version
    # closed a process-wide shared connection here, which could disconnect one
    # thread's connection while another thread was still reading from it.

    return app
