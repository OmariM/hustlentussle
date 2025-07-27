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

# For production with Gunicorn and eventlet worker, we use the socketio object directly
# The socketio object is WSGI-compatible when used with eventlet worker
# This provides full WebSocket support in production
# We need to use the __call__ method to make it properly callable
class WSGIApplication:
    def __init__(self, socketio_app):
        self.socketio_app = socketio_app
    
    def __call__(self, environ, start_response):
        return self.socketio_app(environ, start_response)

application = WSGIApplication(socketio)

if __name__ == "__main__":
    # This block will be executed if this script is run directly
    # It allows for testing the production configuration locally
    from web.config import get_config
    config = get_config()
    socketio.run(app, host=config.HOST, port=config.PORT, debug=config.DEBUG) 