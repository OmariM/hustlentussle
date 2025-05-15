#!/bin/bash
# Script to deploy changes from main branch to prod branch

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

# Check if we're in a git repository
if [ ! -d .git ]; then
    error "This does not appear to be a git repository. Please run this script from the root of your git repository."
fi

# Save current branch
current_branch=$(git branch --show-current)
info "Current branch: ${yellow}$current_branch${reset}"

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    error "Working directory is not clean. Please commit or stash your changes before deploying."
fi

# Fetch the latest changes
step "Fetching latest changes from remote..."
git fetch

# Checkout main branch and update
step "Checking out main branch and pulling latest changes..."
git checkout main
git pull origin main
info "Main branch is up to date."

# Check if prod branch exists
if ! git show-ref --verify --quiet refs/heads/prod; then
    info "Prod branch does not exist yet. Creating it..."
    git checkout -b prod
else
    # Checkout prod branch
    step "Checking out prod branch..."
    git checkout prod
    
    # Merge main into prod
    step "Merging changes from main into prod..."
    if ! git merge main -m "Merge main into prod for deployment"; then
        error "Merge conflict occurred. Please resolve conflicts manually and complete the merge."
    fi
fi

# Push prod branch to remote
step "Pushing prod branch to remote..."
git push origin prod

# Return to original branch
step "Returning to original branch: ${yellow}$current_branch${reset}..."
git checkout "$current_branch"

echo ""
echo "${bold}${green}✓ Deployment to prod branch completed successfully!${reset}"
echo ""
echo "${bold}Next steps:${reset}"
echo "1. Pull these changes on your production server:"
echo "   ${yellow}git pull origin prod${reset}"
echo ""
echo "2. Restart your application:"
echo "   ${yellow}sudo systemctl restart hustlentussle${reset}"
echo ""
echo "3. Verify the deployment is working as expected."
echo "" 