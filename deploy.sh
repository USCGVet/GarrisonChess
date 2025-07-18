#!/bin/bash

# Build the project
echo "Building project..."
npm run build:prod

# Create a temporary directory
echo "Creating temporary directory..."
mkdir -p temp_deploy

# Copy dist contents to temp
echo "Copying files..."
cp -r dist/* temp_deploy/

# Switch to gh-pages branch
echo "Switching to gh-pages branch..."
git checkout gh-pages || git checkout -b gh-pages

# Remove all files
echo "Cleaning gh-pages branch..."
git rm -rf . || true

# Copy files from temp
echo "Copying built files..."
cp -r temp_deploy/* .

# Clean up
rm -rf temp_deploy

# Commit and push
echo "Committing changes..."
git add .
git commit -m "Deploy to GitHub Pages"

echo "Deployment complete! Push the gh-pages branch to deploy."
echo "Run: git push origin gh-pages"

# Switch back to main
git checkout main