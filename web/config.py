"""
Configuration settings for the Hustle n' Tussle web application.
"""
import os

class Config:
    """Base configuration."""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-hustle-n-tussle-key')
    SESSION_TYPE = 'filesystem'
    HOST = '0.0.0.0'
    PORT = 5000
    DEBUG = False
    ENABLE_DEBUG_TOOLS = False  # Master switch for debug tools
    

class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    ENABLE_DEBUG_TOOLS = True  # Enable debug tools in development
    HOST = '127.0.0.1'
    PORT = 5000


class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False
    ENABLE_DEBUG_TOOLS = False  # Disable debug tools in production
    HOST = '0.0.0.0'
    PORT = 8080
    # In production, ensure you set a proper SECRET_KEY environment variable


# Select configuration based on environment
def get_config():
    env = os.environ.get('FLASK_ENV', 'development')
    if env == 'production':
        return ProductionConfig
    return DevelopmentConfig 