import os
from dotenv import load_dotenv

load_dotenv()

# backend/  — uploads live beside the app, not inside it.
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


class Config:
    """Base configuration"""
    DEBUG = False
    TESTING = False
    
    # Database
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_USER = os.getenv('DB_USER', 'root')
    DB_PASSWORD = os.getenv('DB_PASSWORD', '')
    DB_NAME = os.getenv('DB_NAME', 'social_app')
    
    # Flask
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-key')
    PORT = int(os.getenv('PORT', 5000))

    # Where the frontend lives — used to build the password-reset link.
    FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')

    # Mail: console | file | smtp
    MAIL_BACKEND = os.getenv('MAIL_BACKEND', 'console')
    MAIL_FROM = os.getenv('MAIL_FROM', 'no-reply@ybo-social.local')
    MAIL_HOST = os.getenv('MAIL_HOST', 'localhost')
    MAIL_PORT = os.getenv('MAIL_PORT', '587')
    MAIL_USERNAME = os.getenv('MAIL_USERNAME', '')
    MAIL_PASSWORD = os.getenv('MAIL_PASSWORD', '')
    MAIL_USE_TLS = os.getenv('MAIL_USE_TLS', 'True').strip().lower() in ('1', 'true', 'yes')
    MAIL_FILE_PATH = os.getenv('MAIL_FILE_PATH', os.path.join(BACKEND_DIR, 'sent_mail.log'))

    # AI: which provider backs generation and scoring. 'local' needs no key.
    AI_PROVIDER = os.getenv('AI_PROVIDER', 'local')

    # Autonomous agents (requirement 2.d)
    AGENTS_ENABLED = os.getenv('AGENTS_ENABLED', 'True').strip().lower() in ('1', 'true', 'yes')
    AGENT_TICK_SECONDS = int(os.getenv('AGENT_TICK_SECONDS', '45'))

    # Uploads
    UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', os.path.join(BACKEND_DIR, 'uploads'))
    # Rejects an oversized body before it is read into memory. Flask answers
    # 413 on its own, which the error handler turns into JSON.
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024
    
    # CORS
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:5173').split(',')

    # Session cookie
    # Secure=True requires HTTPS, which localhost does not have, so it is off by
    # default and switched on for production below.
    SESSION_COOKIE_SECURE = os.getenv('SESSION_COOKIE_SECURE', 'False').strip().lower() in ('1', 'true', 'yes')
    SESSION_COOKIE_SAMESITE = os.getenv('SESSION_COOKIE_SAMESITE', 'Lax')


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False


class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    DB_NAME = 'social_app_test'
    # A background job writing to the database during a test run would make
    # results depend on timing.
    AGENTS_ENABLED = False


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False
    # Served over HTTPS, so the session cookie must never travel in the clear.
    SESSION_COOKIE_SECURE = True


def get_config():
    """Get appropriate config based on environment"""
    env = os.getenv('FLASK_ENV', 'development')
    
    if env == 'testing':
        return TestingConfig()
    elif env == 'production':
        return ProductionConfig()
    else:
        return DevelopmentConfig()
