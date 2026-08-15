import os
from dotenv import load_dotenv

load_dotenv()


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
    
    # CORS
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:5173').split(',')


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False


class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    DB_NAME = 'social_app_test'


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False


def get_config():
    """Get appropriate config based on environment"""
    env = os.getenv('FLASK_ENV', 'development')
    
    if env == 'testing':
        return TestingConfig()
    elif env == 'production':
        return ProductionConfig()
    else:
        return DevelopmentConfig()
