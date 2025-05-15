"""
WSGI entry point for the Hustle n' Tussle application.
This file is used for production deployment with Gunicorn, uWSGI, etc.

Usage with Gunicorn:
    gunicorn --bind 0.0.0.0:8080 wsgi:application
"""
import os

# Set the Flask environment to production
os.environ['FLASK_ENV'] = 'production'

from web.app import app as application

if __name__ == "__main__":
    # This block will be executed if this script is run directly
    # It allows for testing the production configuration locally
    from web.config import get_config
    config = get_config()
    application.run(host=config.HOST, port=config.PORT, debug=config.DEBUG) 