require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

// 1. Database and Config
const pool = require('./database');
const { initSchema } = require('./config/db');

// 2. Middleware
const { apiLimiter } = require('./middleware/rateLimit');

// 3. Route Modules
const authRoutes = require('./routes/auth');
const fieldRoutes = require('./routes/fields');
const matchmakingRoutes = require('./routes/matchmaking');
const reservationRoutes = require('./routes/reservations');
const tournamentRoutes = require('./routes/tournaments');
const shopRoutes = require('./routes/shop');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const ownerRoutes = require('./routes/owner');
const spainCampRoutes = require('./routes/spain-camp');
const publicRoutes = require('./routes/public');
const pageRoutes = require('./routes/pages');

// App Initialization
const app = express();
const port = process.env.PORT || 3002;

// --- Security & Global Middleware ---

// Enhanced CSP
app.use(helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: {
        "default-src": ["'self'"],
        "script-src": [
            "'self'",
            "'unsafe-inline'",
            "https://cdn.tailwindcss.com",
            "https://cdn.jsdelivr.net",
            "https://cdnjs.cloudflare.com"
        ],
        "script-src-elem": [
            "'self'",
            "'unsafe-inline'",
            "https://cdn.tailwindcss.com",
            "https://cdn.jsdelivr.net",
            "https://cdnjs.cloudflare.com"
        ],
        "script-src-attr": ["'unsafe-inline'"],
        "style-src": [
            "'self'",
            "'unsafe-inline'",
            "https://cdnjs.cloudflare.com",
            "https://fonts.googleapis.com",
            "https://site-assets.fontawesome.com"
        ],
        "style-src-elem": [
            "'self'",
            "'unsafe-inline'",
            "https://cdnjs.cloudflare.com",
            "https://fonts.googleapis.com",
            "https://site-assets.fontawesome.com"
        ],
        "img-src": ["'self'", "data:", "https:"],
        "font-src": [
            "'self'",
            "https://fonts.gstatic.com",
            "https://cdnjs.cloudflare.com",
            "https://site-assets.fontawesome.com"
        ],
        "connect-src": ["'self'", "https:", "https://cdnjs.cloudflare.com"]
    }
}));

// CORS Configuration
const allowedOrigins = [
    'https://www.5v5games.com',
    'https://5v5games.com',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
    'http://localhost',
    'http://127.0.0.1'
];

app.use(cors({
    origin: (origin, callback) => {
        if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'X-User-Id', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use('/api', apiLimiter);

// --- Static Files ---
app.use(express.static(path.join(__dirname, 'views')));
app.use('/owner_panel', express.static(path.join(__dirname, 'owner_panel'))); // Allow direct access to owner panel files
app.use('/components', express.static(path.join(__dirname, 'components')));
// Map /images to components/images for frontend compatibility
app.use('/images', express.static(path.join(__dirname, 'components/images')));

// --- Database Initialization ---
initSchema();

// --- API Route Mounting ---
app.use('/api/admin', adminRoutes);  // /api/admin/*
app.use('/api', authRoutes);         // /api/signup, /api/login, /api/me, /api/logout
app.use('/api/fields', fieldRoutes); // /api/fields, /api/fields/:id/ratings
app.use('/api', matchmakingRoutes);  // /api/matchmake, /api/team-building/initiate, etc.
app.use('/api', reservationRoutes);  // /api/reserve, /api/user-reservations/:userId
app.use('/api/tournaments', tournamentRoutes); // /api/tournaments, /api/tournaments/:id/teams, etc.
app.use('/api/fashion', shopRoutes);         // /api/fashion/products
app.use('/api/user', userRoutes);    // /api/user/:userId, /api/user/upcoming-birthdays
app.use('/api/owner', ownerRoutes);  // /api/owner/login, /api/owner/system-status
app.use('/api/spain-camp', spainCampRoutes); // /api/spain-camp/apply
app.use('/api', publicRoutes);       // /api/gallery, /api/sponsors, /api/giveaways, /api/availability, /api/csrf-token, etc.

// --- Page Route Mounting ---
app.use('/', pageRoutes);

// --- Server Startup ---
app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
    console.log('📁 Application modularized and organized.');
    console.log('🔍 Test logo access: http://localhost:' + port + '/images/logo.jpg');
});
