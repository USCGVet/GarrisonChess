# GitHub Pages Deployment Guide

## Prerequisites
1. Make sure you have committed all your changes to the main branch
2. Your repository should be pushed to GitHub

## Step 1: Configure Git (if needed)
```bash
git config --global user.email "your-email@example.com"
git config --global user.name "Your Name"
```

## Step 2: Commit Current Changes
```bash
git add -A
git commit -m "Add mobile UI improvements and deployment setup"
git push origin main
```

## Step 3: Build and Deploy
```bash
npm run deploy
```

This command will:
1. Build the production version (via predeploy script)
2. Create/update a `gh-pages` branch with the dist folder contents
3. Push to GitHub

## Step 4: Configure GitHub Pages
1. Go to your repository on GitHub
2. Click on "Settings" tab
3. Scroll down to "Pages" section in the left sidebar
4. Under "Source", select:
   - Source: "Deploy from a branch"
   - Branch: "gh-pages"
   - Folder: "/ (root)"
5. Click "Save"

## Step 5: Access Your Site
Your site will be available at:
`https://[your-username].github.io/[repository-name]/`

It may take a few minutes for the site to become available.

## Updating the Site
Whenever you want to update the site:
```bash
npm run deploy
```

## Troubleshooting
- If you see a 404 error, wait a few minutes and refresh
- Make sure the repository is public (or you have GitHub Pages enabled for private repos)
- Check that the gh-pages branch was created successfully
- Ensure all assets are loading with correct paths