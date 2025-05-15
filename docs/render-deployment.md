# Deploying Hustle n' Tussle on Render with Custom Domain

This guide walks you through the complete process of deploying Hustle n' Tussle to Render and connecting your custom domain with HTTPS.

## Prerequisites

1. A GitHub account with your Hustle n' Tussle repository pushed to it
2. A custom domain (purchased from a domain registrar like Namecheap, GoDaddy, etc.)
3. Access to your domain's DNS settings

## Step 1: Set Up Your Repository

Make sure your repository includes these files:

- **requirements.prod.txt**: Production dependencies
- **wsgi.py**: WSGI entry point
- **render.yaml**: Render configuration (optional but recommended)
- **Procfile**: Defines process types (optional but helpful)

Your repository should already have these files if you've followed our previous steps.

## Step 2: Create a Render Account

1. Go to [render.com](https://render.com) and sign up for an account
2. Verify your email address

## Step 3: Connect Your GitHub Repository

1. In the Render dashboard, click **New +** and select **Web Service**
2. Connect your GitHub account if you haven't already
3. Select the repository containing Hustle n' Tussle
4. If you have a `render.yaml` file, Render will automatically configure the service settings

## Step 4: Configure Your Web Service Manually (if not using render.yaml)

1. **Name**: `hustlentussle` (or something descriptive)
2. **Environment**: `Python 3`
3. **Region**: Choose closest to your target audience
4. **Branch**: `prod` (or your production branch)
5. **Build Command**: `pip install -r requirements.prod.txt`
6. **Start Command**: `gunicorn wsgi:application`
7. **Plan**: Choose `Free` to start (can upgrade later)

## Step 5: Configure Environment Variables

Add the following environment variables:

1. Click **Advanced** and then **Add Environment Variable**
2. Add the following:
   - `FLASK_ENV`: `production`
   - `SECRET_KEY`: Generate a secure random string (you can use [random.org](https://www.random.org/strings/))

## Step 6: Deploy Your Service

1. Click **Create Web Service**
2. Wait for the build and deployment to complete (this may take a few minutes)
3. Once deployed, Render will provide a URL like `https://hustlentussle.onrender.com`
4. Visit this URL to verify your application is running

## Step 7: Connect Your Custom Domain

1. Purchase a domain from a domain registrar if you don't already have one
2. In your Render dashboard, go to your web service
3. Click on the **Settings** tab
4. Scroll down to **Custom Domains**
5. Click **Add Custom Domain**
6. Enter your domain (e.g., `yourdomain.com`)
7. Click **Add**

## Step 8: Configure DNS Settings

Render will provide you with instructions to configure your DNS. You have two options:

### Option A: Using Render's Name Servers (Recommended)

1. In your domain registrar's dashboard, find the nameserver settings
2. Replace the current nameservers with Render's nameservers:
   - `ns1.render.com`
   - `ns2.render.com`
3. Save the changes (may take up to 48 hours to propagate)

### Option B: Using CNAME Records

1. In your domain registrar's dashboard, find the DNS settings
2. Add a CNAME record:
   - **Name**: `www` (or `@` for the root domain)
   - **Value**: The Render domain (e.g., `hustlentussle.onrender.com`)
   - **TTL**: 3600 (or recommended value)
3. Save the changes

## Step 9: Set Up HTTPS

Render automatically provides free SSL certificates via Let's Encrypt when you add a custom domain. You don't need to do anything extra for HTTPS!

## Step 10: Verify Deployment

1. After DNS changes have propagated, visit your domain (e.g., `https://yourdomain.com`)
2. Verify the application loads correctly
3. Test the core functionality to ensure everything works

## Common Issues and Solutions

### Application Crash on Deploy
- Check the build logs for errors
- Ensure your `requirements.prod.txt` includes all dependencies
- Verify your `wsgi.py` is correctly configured

### DNS Issues
- DNS changes can take up to 48 hours to propagate
- Verify your DNS settings match Render's instructions
- Use [dnschecker.org](https://dnschecker.org) to check propagation

### Application Not Working as Expected
- Check Render logs from your dashboard
- Ensure environment variables are set correctly
- Test the application locally with production settings first

## Maintaining Your Application

### Automatic Deployments
Render automatically deploys when you push to your configured branch. To update:

1. Push changes to your `prod` branch
2. Render will automatically rebuild and deploy

### Manual Deployments
You can also trigger manual deployments:

1. Go to your web service in the Render dashboard
2. Click **Manual Deploy**
3. Select **Deploy latest commit**

## Monitoring and Scaling

1. **Logs**: View logs in your Render dashboard for debugging
2. **Metrics**: Monitor performance in the dashboard
3. **Scaling**: Upgrade to a paid plan when needed for more resources

## Additional Resources

- [Render Documentation](https://render.com/docs)
- [Flask on Render](https://render.com/docs/deploy-flask)
- [Custom Domain Setup](https://render.com/docs/custom-domains) 