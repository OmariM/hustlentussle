"""
WSGI entry point for the Hustle n' Tussle application.
This file is used for production deployment with Gunicorn, uWSGI, etc.

Usage with Gunicorn:
    gunicorn --worker-class eventlet --bind 0.0.0.0:8080 wsgi:application
"""
import os

# Set the Flask environment to production
os.environ['FLASK_ENV'] = 'production'

from web.app import app, socketio

# For production with Gunicorn, we need to handle both sync and eventlet workers
# The socketio object is WSGI-compatible when used with eventlet worker
# For sync workers, we need to use the Flask app directly
def create_app(environ, start_response):
    print(f"DEBUG: Request path: {environ.get('PATH_INFO', 'unknown')}")
    print(f"DEBUG: Request method: {environ.get('REQUEST_METHOD', 'unknown')}")
    
    # For now, use Flask app for all requests to get the basic functionality working
    # We'll add WebSocket support later once we can get the eventlet worker working
    return app(environ, start_response)

application = create_app

if __name__ == "__main__":
    # This block will be executed if this script is run directly
    # It allows for testing the production configuration locally
    from web.config import get_config
    config = get_config()
    socketio.run(app, host=config.HOST, port=config.PORT, debug=config.DEBUG) 