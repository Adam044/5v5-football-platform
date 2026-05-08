const express = require('express');
const path = require('path');
const router = express.Router();

// Define views directory
const viewsDir = path.join(__dirname, '../views');

// Helper to serve HTML files
const serveFile = (file) => (req, res) => res.sendFile(path.join(viewsDir, file));

// Core Pages
router.get('/', serveFile('index.html'));
router.get('/fashion', serveFile('5v5-fashion.html'));
router.get('/item', serveFile('item.html'));
router.get('/auth', serveFile('auth.html'));
router.get('/user-dashboard', serveFile('user-dashboard.html'));
router.get('/profile', serveFile('user-dashboard.html'));
router.get('/fields', serveFile('fields.html'));
router.get('/field/:id', serveFile('field.html'));
router.get('/available-slots', serveFile('available-slots.html'));
router.get('/privacy-policy', serveFile('privacy-policy.html'));
router.get('/team-signup', serveFile('team-signup.html'));

// Community Pages
router.get('/gallery', serveFile('gallery.html'));
router.get('/giveaways', serveFile('giveaways.html'));
router.get('/tournaments', serveFile('tournaments.html'));
router.get('/trainings', serveFile('trainings.html'));
router.get('/spain-camp', serveFile('spain-camp.html'));
router.get('/tournament-team-hub', serveFile('tournament-team-hub.html'));

// Matchmaking & Team Building Pages
router.get('/matchmaking', serveFile('matchmaking.html'));
router.get('/team-building', serveFile('team-building.html'));
router.get('/team-join', serveFile('team-join.html'));
router.get('/team-join.html', serveFile('team-join.html')); // Handle both for safety

// Support Pages
router.get('/about', serveFile('about.html'));
router.get('/terms-of-use', serveFile('terms-of-use.html'));

// Admin & Owner Pages
router.get('/admin', serveFile('admin/index.html'));
router.get('/coach-dashboard', serveFile('coach-dashboard.html'));
router.get('/owner-panel', serveFile('owner-panel.html'));

module.exports = router;
