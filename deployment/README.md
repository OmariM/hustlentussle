# Deployment Instructions

This directory contains configuration files and instructions for deploying the Hustle n' Tussle application to a production environment.

## Prerequisites

- A server with Python 3.8+ installed
- Nginx or similar web server
- Systemd (for service management)
- Domain name pointed to your server

## Deployment Scripts

This repository includes two helpful scripts for managing deployment:

1. **`deploy_to_prod.sh`** (run on your development machine)
   - Merges changes from the main branch to the prod branch
   - Pushes the updated prod branch to the remote repository
   - Safely handles branch switching and error checking

2. **`deployment/update_server.sh`** (run on your production server)
   - Pulls the latest changes from the prod branch
   - Updates dependencies if requirements have changed
   - Restarts the application service
   - Provides status and error information

## Initial Deployment Steps

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

6. **Prepare the update script**
   ```bash
   # Copy the update script to a convenient location
   cp deployment/update_server.sh ./update.sh
   
   # Edit the script to set your actual paths
   nano update.sh
   
   # Make it executable
   chmod +x update.sh
   ```

7. **Verify the application is running**
   ```bash
   sudo systemctl status hustlentussle
   curl http://localhost:8080  # Should return the application HTML
   ```

8. **Set up HTTPS with Let's Encrypt** (recommended)
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```

## Updating the Application

### Option 1: Using the update script (recommended)

1. **On your development machine**:
   ```bash
   # Make and commit your changes to main
   ./deploy_to_prod.sh
   ```

2. **On your production server**:
   ```bash
   ./update.sh
   ```

### Option 2: Manual update

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