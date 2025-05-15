# Deployment Instructions

This directory contains configuration files and instructions for deploying the Hustle n' Tussle application to a production environment.

## Prerequisites

- A server with Python 3.8+ installed
- Nginx or similar web server
- Systemd (for service management)
- Domain name pointed to your server

## Deployment Steps

1. **Clone the production branch**
   ```bash
   git clone -b prod https://github.com/yourusername/hustlentussle.git
   cd hustlentussle
   ```

2. **Set up a virtual environment**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.prod.txt
   ```

3. **Configure environment variables**
   ```bash
   # Create a .env file or set these in your environment
   export FLASK_ENV=production
   export SECRET_KEY=your-secure-key-here  # Use a strong random key
   ```

4. **Set up Nginx**
   ```bash
   # Edit the nginx.conf file to match your domain and paths
   sudo cp deployment/nginx.conf /etc/nginx/sites-available/hustlentussle
   sudo ln -s /etc/nginx/sites-available/hustlentussle /etc/nginx/sites-enabled/
   sudo nginx -t  # Test configuration
   sudo systemctl reload nginx
   ```

5. **Set up systemd service**
   ```bash
   # Edit the service file to match your paths
   sudo cp deployment/hustlentussle.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable hustlentussle
   sudo systemctl start hustlentussle
   ```

6. **Verify the application is running**
   ```bash
   sudo systemctl status hustlentussle
   curl http://localhost:8080  # Should return the application HTML
   ```

7. **Set up HTTPS with Let's Encrypt** (recommended)
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```

## Updating the Application

When you have changes to deploy:

1. **Pull the latest changes**
   ```bash
   cd /path/to/hustlentussle
   git pull
   ```

2. **Restart the service**
   ```bash
   sudo systemctl restart hustlentussle
   ```

## Troubleshooting

- **Check application logs**
  ```bash
  sudo journalctl -u hustlentussle
  ```

- **Test the WSGI application**
  ```bash
  cd /path/to/hustlentussle
  source venv/bin/activate
  python wsgi.py  # Should start the app in production mode
  ```

- **Verify Nginx configuration**
  ```bash
  sudo nginx -t
  ``` 