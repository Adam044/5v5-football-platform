# 5v5 Football Platform

A comprehensive football field booking platform built with Node.js, Express, and SQLite.

## Features

- User registration and authentication
- Field booking system
- Admin dashboard for field management
- Tournament organization
- Team joining functionality
- Responsive Arabic/English interface

## Local Development

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to `http://localhost:3002`

## Deployment to Render

### Step 1: Prepare Your Code

All deployment files are already configured:
- ✅ `render.yaml` - Render service configuration
- ✅ `package.json` - Updated with start script
- ✅ `.gitignore` - Excludes unnecessary files
- ✅ Environment variables configured in `server.js`

### Step 2: Create Git Repository

1. Initialize Git repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - 5v5 Football Platform"
   ```

2. Create a repository on GitHub/GitLab/Bitbucket

3. Push your code:
   ```bash
   git remote add origin <your-repository-url>
   git branch -M main
   git push -u origin main
   ```

### Step 3: Deploy on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New" → "Web Service"
3. Connect your Git provider (GitHub/GitLab/Bitbucket)
4. Select your repository
5. Configure the service:
   - **Name**: `5v5-football-platform`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or paid for better performance)

### Step 4: Environment Variables (Optional)

In Render dashboard, you can set:
- `ADMIN_EMAIL`: Your admin email (default: 5v5.palestine@gmail.com)
- `NODE_ENV`: production

### Step 5: Database Persistence

The SQLite database (`5v5.db`) will be automatically created and persisted using Render's disk storage.

## Project Structure

```
5v5-football-platform/
├── components/
│   ├── images/          # Static images
│   └── styles.css       # Global styles
├── views/               # HTML templates
│   ├── index.html       # Homepage
│   ├── auth.html        # Login/Register
│   ├── user-dashboard.html
│   ├── admin-dashboard.html
│   └── ...
├── server.js            # Main server file
├── package.json         # Dependencies
├── render.yaml          # Render configuration
└── 5v5.db              # SQLite database
```

## Admin Access

- Default admin email: `5v5.palestine@gmail.com`
- Admin users can manage fields, view bookings, and access analytics

## Support

For deployment issues or questions, contact: 5v5.palestine@gmail.com

---

**Ready for deployment!** 🚀