"""
Configuration settings for the Hustle n' Tussle web application.
"""

import os

# Insecure fallback used only for local development / tests.
_DEV_SECRET_KEY = "dev-hustle-n-tussle-key"

# Hosts allowed as browser origins for cookie-authenticated admin requests
# (and used to build the CORS allowlist). Override with a comma-separated
# ALLOWED_ORIGIN_HOSTS env var.
ALLOWED_ORIGIN_HOSTS = [
    h.strip()
    for h in os.environ.get(
        "ALLOWED_ORIGIN_HOSTS",
        "hustlentussle.com,www.hustlentussle.com,dev.hustlentussle.com,localhost,127.0.0.1",
    ).split(",")
    if h.strip()
]


class Config:
    """Base configuration."""

    SECRET_KEY = os.environ.get("SECRET_KEY", _DEV_SECRET_KEY)
    SESSION_TYPE = "filesystem"
    HOST = "0.0.0.0"
    PORT = 5001
    DEBUG = False
    ENABLE_DEBUG_TOOLS = False  # Master switch for debug tools

    # Session cookie hardening. Secure is enabled in production only so that
    # plain-HTTP local development keeps working.
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = False

    # Database settings
    DATABASE_URL = os.environ.get("DATABASE_URL")

    # Game expiration (6 hours in seconds)
    GAME_EXPIRATION_SECONDS = int(os.environ.get("GAME_EXPIRATION_SECONDS", 6 * 60 * 60))

    # Cleanup interval (1 hour in seconds)
    CLEANUP_INTERVAL_SECONDS = int(os.environ.get("CLEANUP_INTERVAL_SECONDS", 60 * 60))

    # Fallback behavior: if True, falls back to in-memory when DB unavailable
    # If False, raises errors when DB is unavailable
    PERSISTENCE_FALLBACK_ENABLED = os.environ.get("PERSISTENCE_FALLBACK_ENABLED", "true").lower() == "true"


class DevelopmentConfig(Config):
    """Development configuration."""

    DEBUG = True
    ENABLE_DEBUG_TOOLS = True  # Enable debug tools in development
    HOST = os.environ.get("HOST", "127.0.0.1")
    PORT = int(os.environ.get("PORT", 5001))

    # In development, use in-memory by default (no DATABASE_URL)
    # Set DATABASE_URL env var to test with PostgreSQL locally


class ProductionConfig(Config):
    """Production configuration."""

    DEBUG = False
    ENABLE_DEBUG_TOOLS = False  # Disable debug tools in production
    HOST = "0.0.0.0"
    PORT = 8080

    SESSION_COOKIE_SECURE = True

    # In production, DATABASE_URL should be set via environment

    # Disable fallback in production to ensure we notice DB issues
    PERSISTENCE_FALLBACK_ENABLED = os.environ.get("PERSISTENCE_FALLBACK_ENABLED", "false").lower() == "true"


# Select configuration based on environment
def get_config():
    env = os.environ.get("FLASK_ENV", "development")
    if env == "production":
        if ProductionConfig.SECRET_KEY == _DEV_SECRET_KEY:
            raise RuntimeError("SECRET_KEY must be set (and not the dev default) when FLASK_ENV=production")
        return ProductionConfig
    return DevelopmentConfig
