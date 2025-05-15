#!/bin/bash
# Script to create and set up the prod branch

# Check if we're in a git repository
if [ ! -d .git ]; then
    echo "Error: This does not appear to be a git repository."
    echo "Please run this script from the root of your git repository."
    exit 1
fi

# Check current branch
current_branch=$(git branch --show-current)
echo "Current branch: $current_branch"

# Make sure the working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    echo "Error: Working directory is not clean."
    echo "Please commit or stash your changes before creating the prod branch."
    git status
    exit 1
fi

# Create and checkout the prod branch
echo "Creating and checking out prod branch..."
git checkout -b prod

# Ensure we have all the necessary directories
mkdir -p deployment
echo "Created deployment directory for configuration files."

echo "Production branch 'prod' has been created and set up."
echo "You've added the following production-specific files:"
echo "- web/config.py - Configuration settings for different environments"
echo "- wsgi.py - WSGI entry point for production deployment"
echo "- requirements.prod.txt - Production dependencies"
echo "- deployment/ directory with Nginx, systemd, and setup instructions"
echo ""
echo "Next steps:"
echo "1. Commit these changes to the prod branch:"
echo "   git add ."
echo "   git commit -m \"Configure for production deployment\""
echo ""
echo "2. Push the prod branch to your remote repository:"
echo "   git push -u origin prod"
echo ""
echo "3. Return to your development branch:"
echo "   git checkout $current_branch"
echo ""
echo "4. In the future, when you want to deploy to production:"
echo "   git checkout prod"
echo "   git merge $current_branch"
echo "   git push origin prod"
echo "   # Then follow the deployment instructions"
echo ""
echo "For more deployment details, see deployment/README.md" 