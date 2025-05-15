#!/bin/bash
# Script to update the Hustle n' Tussle application on the server
# Place this script on your production server and run it to deploy updates

set -e  # Exit immediately if a command exits with a non-zero status

# Text formatting
bold=$(tput bold)
green=$(tput setaf 2)
yellow=$(tput setaf 3)
red=$(tput setaf 1)
reset=$(tput sgr0)

# Function to display step information
step() {
    echo "${bold}${green}[STEP]${reset} $1"
}

# Function to display info
info() {
    echo "${bold}${yellow}[INFO]${reset} $1"
}

# Function to display error and exit
error() {
    echo "${bold}${red}[ERROR]${reset} $1"
    exit 1
}

# Configuration
APP_DIR="/path/to/hustlentussle"  # Change this to your actual app directory
SERVICE_NAME="hustlentussle"      # Change if your systemd service name is different
VENV_DIR="$APP_DIR/venv"         # Path to virtual environment
BRANCH="prod"                    # Branch to deploy from

# Check if directory exists
if [ ! -d "$APP_DIR" ]; then
    error "Application directory $APP_DIR does not exist."
fi

# Navigate to application directory
cd "$APP_DIR"
info "Working in $(pwd)"

# Check if this is a git repository
if [ ! -d .git ]; then
    error "This does not appear to be a git repository."
fi

# Save current branch
current_branch=$(git branch --show-current)
info "Current branch: ${yellow}$current_branch${reset}"

# Check for local changes
if [ -n "$(git status --porcelain)" ]; then
    error "Working directory is not clean. Please investigate."
fi

# Fetch latest changes
step "Fetching latest changes from remote..."
git fetch origin

# Check if there are changes to pull
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse origin/$BRANCH)

if [ $LOCAL = $REMOTE ]; then
    info "Already up-to-date, no changes to deploy."
else
    # Backup database or important files if needed
    # step "Creating backup..."
    # cp -r data data.backup-$(date +%Y%m%d-%H%M%S)

    # Pull latest changes
    step "Pulling latest changes from $BRANCH branch..."
    git checkout $BRANCH
    git pull origin $BRANCH

    # Install dependencies if requirements changed
    if git diff --name-only HEAD@{1} HEAD | grep -q "requirements.prod.txt"; then
        step "Requirements changed, updating dependencies..."
        source "$VENV_DIR/bin/activate"
        pip install -r requirements.prod.txt
        deactivate
    fi

    # Restart the service
    step "Restarting service..."
    if systemctl is-active --quiet $SERVICE_NAME; then
        sudo systemctl restart $SERVICE_NAME
        info "Service restarted."
    else
        sudo systemctl start $SERVICE_NAME
        info "Service started."
    fi

    # Check if service is running
    if systemctl is-active --quiet $SERVICE_NAME; then
        echo ""
        echo "${bold}${green}✓ Deployment completed successfully!${reset}"
        systemctl status $SERVICE_NAME --no-pager
    else
        error "Service failed to start. Check logs with: sudo journalctl -u $SERVICE_NAME"
    fi
fi

# Return to original branch if different
if [ "$current_branch" != "$BRANCH" ]; then
    step "Returning to original branch: ${yellow}$current_branch${reset}..."
    git checkout "$current_branch"
fi

echo ""
info "You can check application logs with:"
echo "   ${yellow}sudo journalctl -u $SERVICE_NAME -f${reset}"
echo "" 