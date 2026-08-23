from flask import Flask
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from app.config import get_config
from app.routes import (auth_bp, posts_bp, users_bp, follow_bp, upload_bp,
                        interactions_bp, moderation_bp, ai_bp)


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

    # Behind nginx the app sees every request as coming from 127.0.0.1 over
    # plain HTTP, because that is what the proxy speaks to it. ProxyFix reads
    # the X-Forwarded-* headers nginx sets so the real client address and the
    # real scheme are used instead — which is what makes url_for(_external=True)
    # produce https:// links, and what stops every log line saying 127.0.0.1.
    #
    # Only ever trust these headers when there really is a proxy in front:
    # a client can send them itself, and trusting them without one lets anyone
    # claim any IP address.
    if config.TRUST_PROXY_HEADERS:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    
    # Setup CORS
    # supports_credentials is what allows the browser to send the session
    # cookie on cross-origin calls (the dev frontend is :5173, the API :5000).
    # It also forbids a wildcard origin, which is why CORS_ORIGINS must list
    # real origins.
    CORS(app, resources={
        r"/api/*": {
            "origins": app.config['CORS_ORIGINS'],
            # Every verb the API actually answers, and nothing else. PATCH was
            # missing, so the preflight for it came back without an
            # Access-Control-Allow-Methods header and the browser refused to
            # send the request. The only PATCH endpoint is
            # /api/moderation/reports/<id>, which is why the symptom was
            # "the Dismiss button in the dashboard does nothing" — with a
            # working server, a passing unit test, and nothing in the log.
            # PUT was listed and is not used by any route.
            "methods": ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
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
    app.register_blueprint(interactions_bp)
    app.register_blueprint(moderation_bp)
    app.register_blueprint(ai_bp)
    
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
    
    # The autonomous agents (requirement 2.d). Started here so it runs with the
    # app rather than needing a second process to be launched by hand.
    from app.agents_runner import start as start_agents
    start_agents(app)

    # Connections come from a pool and are returned by the code that borrowed
    # them, so there is nothing to tear down per request. The previous version
    # closed a process-wide shared connection here, which could disconnect one
    # thread's connection while another thread was still reading from it.

    return app
