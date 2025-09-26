const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const app = express();

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-User-Id');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});
const port = process.env.PORT || 3002;
const saltRounds = 10;
const adminEmail = process.env.ADMIN_EMAIL || '5v5.palestine@gmail.com';

// Increase the JSON body size limit to handle image uploads
app.use(express.json({ limit: '50mb' }));

// Connect to SQLite database
const db = new sqlite3.Database(path.join(__dirname, '5v5.db'), (err) => {
    if (err) {
        return console.error(err.message);
    }
    console.log('Connected to the 5v5 SQLite database.');
    db.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            phone_number TEXT NOT NULL,
            birthdate TEXT,
            password TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS fields (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            location TEXT,
            image BLOB,
            price_per_hour REAL
        );
        -- Updated: This table now only handles immediate full-field reservations
        CREATE TABLE IF NOT EXISTS availability_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            field_id INTEGER NOT NULL,
            slot_date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            is_reserved INTEGER DEFAULT 0,
            reservation_type TEXT,
            user_id INTEGER,
            FOREIGN KEY (field_id) REFERENCES fields(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        -- Updated: This is now the dedicated table for all matchmaking requests
        CREATE TABLE IF NOT EXISTS matchmaking_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            field_id INTEGER NOT NULL,
            slot_date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            request_type TEXT NOT NULL, -- 'team_vs_team', 'team_looking_players', 'players_looking_team'
            status TEXT DEFAULT 'pending', -- 'pending', 'matched', 'completed'
            players_needed INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (field_id) REFERENCES fields(id)
        );
        CREATE TABLE IF NOT EXISTS tournaments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            field_id INTEGER NOT NULL,
            tournament_date TEXT NOT NULL,
            prize TEXT,
            description TEXT,
            image_data BLOB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (field_id) REFERENCES fields(id)
        );
        CREATE TABLE IF NOT EXISTS tournament_participations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            team_name TEXT NOT NULL,
            captain_name TEXT NOT NULL,
            contact_email TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        -- Team building sessions for managing team formation
        CREATE TABLE IF NOT EXISTS team_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invitation_code TEXT NOT NULL UNIQUE,
            creator_id INTEGER NOT NULL,
            booking_type TEXT NOT NULL, -- 'two_teams_ready', 'team_vs_team', 'team_looking_for_players', 'players_looking_for_team'
            field_id INTEGER NOT NULL,
            slot_date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            status TEXT DEFAULT 'active', -- 'active', 'completed', 'cancelled'
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (creator_id) REFERENCES users(id),
            FOREIGN KEY (field_id) REFERENCES fields(id)
        );
        -- Team members for tracking players in team building sessions
        CREATE TABLE IF NOT EXISTS team_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            team_designation TEXT NOT NULL, -- 'A', 'B', or 'single' for single team scenarios
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES team_sessions(id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE (session_id, user_id)
        );
    `);
    
    // Add is_admin column if it doesn't exist (for existing databases)
    db.run(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding is_admin column:', err);
        }
    });
    
    // Check if phone_number column exists, if not, add it (migration for existing databases)
    db.run(`ALTER TABLE users ADD COLUMN phone_number TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            db.run(`UPDATE users SET phone_number = phone WHERE phone_number IS NULL`, (updateErr) => {
                if (updateErr) {
                    console.log('Phone number migration not needed or already completed');
                }
            });
        }
    });
    
    // Add image column to fields table if it doesn't exist (migration for existing databases)
    db.run(`ALTER TABLE fields ADD COLUMN image BLOB`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.log('Image column migration not needed or already exists');
        }
    });

    // Add unique constraint to team_members
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_session_user ON team_members (session_id, user_id)`, (err) => {
        if (err && !err.message.includes('already exists')) {
            console.error('Error adding unique index to team_members:', err);
        }
    });
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'views')));
app.use(express.static(path.join(__dirname, 'components')));

// Security middleware to check for admin
const checkAdmin = (req, res, next) => {
    // Defensive checks for request object properties
    const query = req.query || {};
    const body = req.body || {};
    const headers = req.headers || {};
    
    const userId = query.userId || body.userId || headers['x-user-id'];
    
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized. User ID is required.' });
    }

    const sql = `SELECT is_admin FROM users WHERE id = ?`;
    db.get(sql, [userId], (err, row) => {
        if (err) {
            console.error('Database error in checkAdmin:', err);
            return res.status(500).json({ error: 'Database error during authentication check.' });
        }
        if (!row) {
            return res.status(401).json({ error: 'Unauthorized. User not found.' });
        }
        if (row.is_admin !== 1) {
            return res.status(403).json({ error: 'Forbidden. You do not have administrator access.' });
        }
        next();
    });
};

// API endpoint to get all fields
app.get('/api/fields', (req, res) => {
    const sql = `SELECT * FROM fields`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        const fieldsWithBase64 = rows.map(field => {
            if (field.image) {
                field.image = Buffer.from(field.image).toString('base64');
            }
            return field;
        });
        res.json({ fields: fieldsWithBase64 });
    });
});

// API endpoint to get a single field's details
app.get('/api/fields/:fieldId', (req, res) => {
    const { fieldId } = req.params;
    const sql = `SELECT * FROM fields WHERE id = ?`;
    db.get(sql, [fieldId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Field not found' });
        }
        if (row.image) {
            row.image = Buffer.from(row.image).toString('base64');
        }
        res.json({ field: row });
    });
});

// API endpoint to get availability for a specific field
app.get('/api/availability/:fieldId', (req, res) => {
    const { fieldId } = req.params;
    const { date } = req.query; 
    
    if (!date) {
        return res.status(400).json({ error: 'Date parameter is required.' });
    }

    const sql = `SELECT * FROM availability_slots WHERE field_id = ? AND slot_date = ? AND is_reserved = 0`;
    db.all(sql, [fieldId, date], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ availability: rows });
    });
});

// API endpoint for user sign-up
app.post('/api/signup', (req, res) => {
    const { name, email, phone, password, is_admin } = req.body;

    if (!name || !email || !phone || !password) {
        return res.status(400).json({ error: 'Please provide all required fields.' });
    }

    bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
        if (err) {
            console.error('Error hashing password:', err);
            return res.status(500).json({ error: 'Could not create account.' });
        }

        const sql = `INSERT INTO users (name, email, phone_number, password, is_admin) VALUES (?, ?, ?, ?, ?)`;
        db.run(sql, [name, email, phone, hashedPassword, is_admin ? 1 : 0], function (err) {
            if (err) {
                console.error('Error inserting user:', err);
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ error: 'This email is already registered.' });
                }
                return res.status(500).json({ error: 'Could not create account.' });
            }
            res.status(201).json({ message: 'User created successfully.', userId: this.lastID });
        });
    });
});

// API endpoint for user login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const sql = `SELECT id, name, email, password, is_admin FROM users WHERE email = ?`;
    db.get(sql, [email], (err, user) => {
        if (err) {
            console.error('Error fetching user:', err);
            return res.status(500).json({ error: 'Server error. Please try again later.' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        bcrypt.compare(password, user.password, (err, result) => {
            if (err) {
                console.error('Error comparing passwords:', err);
                return res.status(500).json({ error: 'Server error. Please try again later.' });
            }
            if (result) {
                res.json({ 
                    message: 'Login successful.', 
                    userId: user.id, 
                    userName: user.name, 
                    email: user.email,
                    isAdmin: user.is_admin === 1
                });
            } else {
                res.status(401).json({ error: 'Invalid email or password.' });
            }
        });
    });
});

// API endpoint to get user reservations
app.get('/api/user/reservations/:userId', (req, res) => {
    const { userId } = req.params;
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required.' });
    }
    const sql = `
        SELECT
            r.slot_date,
            r.start_time,
            r.end_time,
            'confirmed' as status,
            f.name AS field_name,
            f.price_per_hour
        FROM availability_slots r
        LEFT JOIN fields f ON r.field_id = f.id
        WHERE r.user_id = ? AND r.is_reserved = 1
        ORDER BY r.slot_date DESC, r.start_time DESC;
    `;
    db.all(sql, [userId], (err, rows) => {
        if (err) {
            console.error('Error fetching user reservations:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ reservations: rows });
    });
});

// API endpoint to get a user's profile information
app.get('/api/user/:userId', (req, res) => {
    const { userId } = req.params;
    const sql = `SELECT id, name, email, phone_number, is_admin FROM users WHERE id = ?`;
    db.get(sql, [userId], (err, row) => {
        if (err) {
            console.error('Error fetching user:', err);
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'User not found.' });
        }
        res.json({ user: row });
    });
});

// --- Enhanced Reservation & Matchmaking Endpoints ---

// API for direct reservations (only for 'full_field' bookings)
app.post('/api/reserve', (req, res) => {
    const { userId, slotId } = req.body;
    if (!userId || !slotId) {
        return res.status(400).json({ error: 'All reservation details are required.' });
    }

    // Use a transaction for atomic operation
    db.serialize(() => {
        db.run("BEGIN TRANSACTION;");
        // Check if the slot is already reserved
        const checkSql = `SELECT is_reserved FROM availability_slots WHERE id = ?`;
        db.get(checkSql, [slotId], (err, row) => {
            if (err || !row) {
                db.run("ROLLBACK;");
                return res.status(404).json({ error: 'Selected slot not found.' });
            }
            if (row.is_reserved === 1) {
                db.run("ROLLBACK;");
                return res.status(409).json({ error: 'Failed to reserve the slot. It may already be taken.' });
            }
            const updateSql = `UPDATE availability_slots SET is_reserved = 1, reservation_type = 'full_field', user_id = ? WHERE id = ?`;
            db.run(updateSql, [userId, slotId], function (err) {
                if (err || this.changes === 0) {
                    db.run("ROLLBACK;");
                    return res.status(500).json({ error: 'Failed to reserve the slot.' });
                }
                db.run("COMMIT;");
                res.json({ message: 'Reservation confirmed successfully!' });
            });
        });
    });
});

// API for handling all types of matchmaking requests (used by Option 4: Player looking for a team)
app.post('/api/matchmake', (req, res) => {
    const { userId, fieldId, slotId, requestType, playersNeeded } = req.body;
    
    if (!userId || !fieldId || !slotId || !requestType) {
        return res.status(400).json({ error: 'All required fields must be provided.' });
    }
    
    // Ensure requestType is valid for direct matchmake (Option 4)
    if (requestType !== 'players_looking_for_team') {
         return res.status(400).json({ error: 'Invalid request type for direct matchmaking.' });
    }
    
    // Get slot details (date, start_time, end_time) from the slotId
    const slotSql = `SELECT slot_date, start_time, end_time FROM availability_slots WHERE id = ?`;
    db.get(slotSql, [slotId], (err, slot) => {
        if (err || !slot) {
            return res.status(404).json({ error: 'The selected time slot does not exist.' });
        }
        
        // Insert a new record into the matchmaking_requests table
        const insertSql = `
            INSERT INTO matchmaking_requests (
                user_id, field_id, slot_date, start_time, end_time, request_type, players_needed
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        db.run(insertSql, [
            userId, fieldId, slot.slot_date, slot.start_time, slot.end_time, requestType, 1 // Always 1 for single player request
        ], function(err) {
            if (err) {
                console.error('Error inserting matchmaking request:', err);
                return res.status(500).json({ error: 'Failed to submit matchmaking request.' });
            }
            res.status(201).json({
                message: 'Matchmaking request submitted successfully. You will be notified when a match is found.',
                requestId: this.lastID
            });
        });
    });
});

// Admin API endpoints (with security middleware)
app.get('/api/admin/fields', checkAdmin, (req, res) => {
    const sql = `SELECT id, name, description, location, image, price_per_hour FROM fields`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        const fieldsWithBase64 = rows.map(field => {
            if (field.image) {
                field.image = Buffer.from(field.image).toString('base64');
            }
            return field;
        });
        res.json({ fields: fieldsWithBase64 });
    });
});

// Endpoint to get all availability slots (for admin view)
app.get('/api/admin/availability', checkAdmin, (req, res) => {
    const { fieldId, date } = req.query;
    
    let sql = `
        SELECT
            r.*,
            u.name as user_name,
            f.name as field_name,
            f.price_per_hour as field_price
        FROM availability_slots r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN fields f ON r.field_id = f.id
    `;
    
    let params = [];
    let conditions = [];
    
    if (fieldId) {
        conditions.push('r.field_id = ?');
        params.push(fieldId);
    }
    
    if (date) {
        conditions.push('r.slot_date = ?');
        params.push(date);
    }
    
    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' ORDER BY r.slot_date DESC, r.start_time ASC';
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ availability: rows });
    });
});

// Endpoint to get all availability slots for a given field and date (for admin view)
app.get('/api/admin/availability/:fieldId', checkAdmin, (req, res) => {
    const { fieldId } = req.params;
    const { date } = req.query;
    if (!fieldId || !date) {
        return res.status(400).json({ error: 'Field ID and date are required.' });
    }
    const sql = `
        SELECT
            r.*,
            u.name as user_name,
            f.name as field_name,
            f.price_per_hour as field_price
        FROM availability_slots r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN fields f ON r.field_id = f.id
        WHERE r.field_id = ? AND r.slot_date = ?
        ORDER BY r.start_time ASC;
    `;
    db.all(sql, [fieldId, date], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ availability: rows });
    });
});

app.post('/api/admin/fields', checkAdmin, (req, res) => {
    const { name, description, location, image, pricePerHour } = req.body;
    if (!name || !location || !pricePerHour) {
        return res.status(400).json({ error: 'Name, location, and price per hour are required.' });
    }
    const sql = `INSERT INTO fields (name, description, location, image, price_per_hour) VALUES (?, ?, ?, ?, ?)`;
    // Decode Base64 string to a Buffer before storing
    const imageData = Buffer.from(image.split(',')[1], 'base64');
    db.run(sql, [name, description, location, imageData, pricePerHour], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ message: 'Field added successfully', fieldId: this.lastID });
    });
});

app.put('/api/admin/fields/:fieldId', checkAdmin, (req, res) => {
    const { fieldId } = req.params;
    const { name, description, location, image, pricePerHour } = req.body;
    if (!name || !location || !pricePerHour) {
        return res.status(400).json({ error: 'All fields are required to update.' });
    }
    const sql = `UPDATE fields SET name = ?, description = ?, location = ?, image = ?, price_per_hour = ? WHERE id = ?`;
    // Decode Base64 string to a Buffer before storing
    const imageData = Buffer.from(image.split(',')[1], 'base64');
    db.run(sql, [name, description, location, imageData, pricePerHour, fieldId], function (err) {
        if (err || this.changes === 0) {
            return res.status(500).json({ error: 'Failed to update field.' });
        }
        res.json({ message: 'Field updated successfully.' });
    });
});

app.delete('/api/admin/fields/:fieldId', checkAdmin, (req, res) => {
    const { fieldId } = req.params;
    db.run(`DELETE FROM fields WHERE id = ?`, [fieldId], function (err) {
        if (err || this.changes === 0) {
            return res.status(500).json({ error: 'Failed to delete field.' });
        }
        res.json({ message: 'Field deleted successfully.' });
    });
});


app.post('/api/admin/availability', checkAdmin, (req, res) => {
    const { fieldId, date, slots } = req.body;
    if (!fieldId || !date || !slots || !Array.isArray(slots) || slots.length === 0) {
        return res.status(400).json({ error: 'Field ID, date, and a non-empty array of slots are required.' });
    }
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION;");
        const stmt = db.prepare(`INSERT INTO availability_slots (field_id, slot_date, start_time, end_time) VALUES (?, ?, ?, ?)`);
        slots.forEach(slot => {
            stmt.run(fieldId, date, slot.start, slot.end);
        });
        stmt.finalize();
        db.run("COMMIT;", (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ message: 'Availability slots added successfully.' });
        });
    });
});

app.get('/api/admin/reservations', checkAdmin, (req, res) => {
    const sql = `
        SELECT
            r.id,
            u.name AS user_name,
            f.name AS field_name,
            r.slot_date,
            r.start_time,
            r.end_time,
            r.reservation_type,
            f.price_per_hour
        FROM availability_slots r
        JOIN fields f ON r.field_id = f.id
        JOIN users u ON r.user_id = u.id
        WHERE r.is_reserved = 1
        ORDER BY r.slot_date DESC, r.start_time DESC;
    `;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ reservations: rows });
    });
});

// Approve reservation request (Admin only)
app.put('/api/admin/reservations/:id/approve', checkAdmin, (req, res) => {
    const reservationId = req.params.id;
    
    // Since there's no reservation_status column, we'll just confirm the reservation exists
    const query = 'SELECT * FROM availability_slots WHERE id = ? AND is_reserved = 1';
    
    db.get(query, [reservationId], function(err, row) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!row) {
            return res.status(404).json({ error: 'Reservation not found or already processed' });
        }
        
        res.json({ message: 'Reservation approved successfully' });
    });
});

// Reject reservation request (Admin only)
app.put('/api/admin/reservations/:id/reject', checkAdmin, (req, res) => {
    const reservationId = req.params.id;
    
    const query = 'UPDATE availability_slots SET is_reserved = 0, user_id = NULL, reservation_type = NULL WHERE id = ? AND is_reserved = 1';
    
    db.run(query, [reservationId], function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Reservation not found or already processed' });
        }
        
        res.json({ message: 'Reservation rejected successfully' });
    });
});

// Cancel confirmed reservation (Admin only)
app.put('/api/admin/reservations/:id/cancel', checkAdmin, (req, res) => {
    const reservationId = req.params.id;
    
    const query = 'UPDATE availability_slots SET is_reserved = 0, user_id = NULL, reservation_type = NULL WHERE id = ? AND is_reserved = 1';
    
    db.run(query, [reservationId], function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Reservation not found or not confirmed' });
        }
        
        res.json({ message: 'Reservation cancelled successfully' });
    });
});

// Delete availability slot (Admin only)
app.delete('/api/admin/availability/:id', checkAdmin, (req, res) => {
    const slotId = req.params.id;
    
    const query = 'DELETE FROM availability_slots WHERE id = ?';
    
    db.run(query, [slotId], function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Availability slot not found' });
        }
        
        res.json({ message: 'Availability slot deleted successfully' });
    });
});

// Update availability slot (Admin only)
app.put('/api/admin/availability/:id', checkAdmin, (req, res) => {
    const slotId = req.params.id;
    const { start_time, end_time, slot_date, field_id } = req.body;
    
    if (!start_time || !end_time || !slot_date || !field_id) {
        return res.status(400).json({ error: 'All fields are required: start_time, end_time, slot_date, field_id' });
    }
    
    // Check if the slot is reserved before updating
    const checkQuery = 'SELECT is_reserved FROM availability_slots WHERE id = ?';
    
    db.get(checkQuery, [slotId], (err, row) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!row) {
            return res.status(404).json({ error: 'Availability slot not found' });
        }
        
        if (row.is_reserved) {
            return res.status(400).json({ error: 'Cannot update a reserved slot' });
        }
        
        // Update the slot
        const updateQuery = 'UPDATE availability_slots SET start_time = ?, end_time = ?, slot_date = ?, field_id = ? WHERE id = ?';
        
        db.run(updateQuery, [start_time, end_time, slot_date, field_id, slotId], function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Availability slot not found' });
            }
            
            res.json({ message: 'Availability slot updated successfully' });
        });
    });
});

// API endpoint for matchmaking suggestions (fixed logic)
app.get('/api/admin/matchmaking/suggestions', checkAdmin, (req, res) => {
    const sql = `
        SELECT
            p.user_id AS player_id,
            player_user.name AS player_name,
            t.user_id AS team_id,
            team_user.name AS team_name,
            p.slot_date,
            p.start_time,
            field.name AS field_name
        FROM matchmaking_requests p
        INNER JOIN matchmaking_requests t
            ON p.slot_date = t.slot_date
            AND p.field_id = t.field_id
        INNER JOIN users AS player_user
            ON p.user_id = player_user.id
        INNER JOIN users AS team_user
            ON t.user_id = team_user.id
        INNER JOIN fields AS field
            ON p.field_id = field.id
        WHERE p.request_type = 'players_looking_for_team'
            AND t.request_type = 'team_looking_for_players'
            AND p.status = 'pending'
            AND t.status = 'pending'
    `;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Error fetching matchmaking suggestions:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ suggestions: rows });
    });
});


app.get('/api/admin/matchmaking-requests', checkAdmin, (req, res) => {
    const sql = `
        SELECT
            m.id,
            u.name AS user_name,
            f.name AS field_name,
            m.slot_date,
            m.start_time,
            m.request_type,
            m.status
        FROM matchmaking_requests m
        JOIN users u ON m.user_id = u.id
        JOIN fields f ON m.field_id = f.id
        ORDER BY m.created_at DESC;
    `;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ requests: rows });
    });
});

// API endpoints for Tournaments
// Get all tournaments
app.get('/api/tournaments', (req, res) => {
    const sql = `
        SELECT
            t.id,
            t.name,
            t.tournament_date,
            t.prize,
            t.description,
            t.image_data,
            f.name AS field_name,
            f.image as field_image
        FROM tournaments t
        JOIN fields f ON t.field_id = f.id
        ORDER BY t.tournament_date ASC;
    `;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        const tournamentsWithBase64 = rows.map(t => {
            if (t.image_data) {
                t.image = Buffer.from(t.image_data).toString('base64');
            }
            if (t.field_image) {
                t.field_image = Buffer.from(t.field_image).toString('base64');
            }
            return t;
        });
        res.json({ tournaments: tournamentsWithBase64 });
    });
});

app.get('/api/admin/tournaments', checkAdmin, (req, res) => {
    const sql = `
        SELECT
            t.id,
            t.name,
            t.tournament_date,
            t.prize,
            t.description,
            t.image_data,
            f.name AS field_name
        FROM tournaments t
        JOIN fields f ON t.field_id = f.id
        ORDER BY t.tournament_date ASC;
    `;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        const tournamentsWithBase64 = rows.map(t => {
            if (t.image_data) {
                t.image_data = Buffer.from(t.image_data).toString('base64');
            }
            return t;
        });
        res.json({ tournaments: tournamentsWithBase64 });
    });
});


app.post('/api/admin/tournaments', checkAdmin, (req, res) => {
    const { name, fieldId, date, prize, image, description } = req.body;
    if (!name || !fieldId || !date || !prize || !image) {
        return res.status(400).json({ error: 'Tournament name, field, date, prize, and image are required.' });
    }
    const sql = `INSERT INTO tournaments (name, field_id, tournament_date, prize, image_data, description) VALUES (?, ?, ?, ?, ?, ?)`;
    // Decode Base64 string to a Buffer before storing
    const imageData = Buffer.from(image.split(',')[1], 'base64');
    db.run(sql, [name, fieldId, date, prize, imageData, description], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ message: 'Tournament added successfully', tournamentId: this.lastID });
    });
});

app.delete('/api/admin/tournaments/:tournamentId', checkAdmin, (req, res) => {
    const { tournamentId } = req.params;
    const sql = `DELETE FROM tournaments WHERE id = ?`;
    db.run(sql, [tournamentId], function (err) {
        if (err || this.changes === 0) {
            return res.status(500).json({ error: 'Failed to delete tournament.' });
        }
        res.json({ message: 'Tournament deleted successfully!' });
    });
});

// Admin analytics endpoints
app.get('/api/admin/analytics', checkAdmin, (req, res) => {
    const queries = {
        totalUsers: `SELECT COUNT(*) as count FROM users`,
        totalReservations: `SELECT COUNT(*) as count FROM availability_slots WHERE is_reserved = 1`,
        totalEarnings: `SELECT SUM(f.price_per_hour) as total FROM availability_slots a JOIN fields f ON a.field_id = f.id WHERE a.is_reserved = 1`,
        totalFields: `SELECT COUNT(*) as count FROM fields`,
        pendingRequests: `SELECT COUNT(*) as count FROM matchmaking_requests WHERE status = 'pending'`,
        recentReservations: `
            SELECT 
                a.slot_date,
                a.start_time,
                u.name as user_name,
                f.name as field_name,
                f.price_per_hour
            FROM availability_slots a
            JOIN users u ON a.user_id = u.id
            JOIN fields f ON a.field_id = f.id
            WHERE a.is_reserved = 1
            ORDER BY a.slot_date DESC, a.start_time DESC
            LIMIT 5
        `
    };

    const results = {};
    let completed = 0;
    const total = Object.keys(queries).length;

    Object.entries(queries).forEach(([key, query]) => {
        if (key === 'recentReservations') {
            db.all(query, [], (err, rows) => {
                if (err) {
                    console.error(`Error in ${key}:`, err);
                    results[key] = key === 'recentReservations' ? [] : 0;
                } else {
                    results[key] = rows;
                }
                completed++;
                if (completed === total) {
                    res.json(results);
                }
            });
        } else {
            db.get(query, [], (err, row) => {
                if (err) {
                    console.error(`Error in ${key}:`, err);
                    results[key] = 0;
                } else {
                    results[key] = row.count || row.total || 0;
                }
                completed++;
                if (completed === total) {
                    res.json(results);
                }
            });
        }
    });
});

app.post('/api/admin/matchmaking-requests/:requestId/approve', checkAdmin, (req, res) => {
    const { requestId } = req.params;
    
    // Use a transaction for atomic operations
    db.serialize(() => {
        db.run("BEGIN TRANSACTION;");

        // Get the matchmaking request details
        const getRequestSql = `SELECT * FROM matchmaking_requests WHERE id = ?`;
        db.get(getRequestSql, [requestId], (err, request) => {
            if (err || !request) {
                db.run("ROLLBACK;");
                return res.status(404).json({ error: 'Matchmaking request not found.' });
            }
            
            // Check if the corresponding availability slot is available
            const checkSlotSql = `SELECT id FROM availability_slots WHERE field_id = ? AND slot_date = ? AND start_time = ? AND is_reserved = 0`;
            db.get(checkSlotSql, [request.field_id, request.slot_date, request.start_time], (err, slot) => {
                if (err || !slot) {
                    db.run("ROLLBACK;");
                    return res.status(400).json({ error: 'The corresponding slot is no longer available.' });
                }

                // Update the matchmaking request status to approved
                const updateRequestSql = `UPDATE matchmaking_requests SET status = 'approved' WHERE id = ?`;
                db.run(updateRequestSql, [requestId], (updateErr) => {
                    if (updateErr) {
                        console.error('Error approving matchmaking request:', updateErr);
                        db.run("ROLLBACK;");
                        return res.status(500).json({ error: 'Failed to approve request.' });
                    }
                    
                    // Update the availability slot
                    const updateSlotSql = `UPDATE availability_slots SET is_reserved = 1, reservation_type = ?, user_id = ? WHERE id = ?`;
                    db.run(updateSlotSql, [request.request_type, request.user_id, slot.id], (slotErr) => {
                        if (slotErr) {
                            console.error('Error reserving slot:', slotErr);
                            db.run("ROLLBACK;");
                            return res.status(500).json({ error: 'Failed to reserve the slot.' });
                        }
                        
                        db.run("COMMIT;", (commitErr) => {
                            if (commitErr) {
                                console.error('Commit error:', commitErr);
                                return res.status(500).json({ error: 'Transaction failed.' });
                            }
                            res.json({ message: 'Matchmaking request approved and slot reserved successfully!' });
                        });
                    });
                });
            });
        });
    });
});

app.post('/api/admin/matchmaking-requests/:requestId/reject', checkAdmin, (req, res) => {
    const { requestId } = req.params;
    const sql = `UPDATE matchmaking_requests SET status = 'rejected' WHERE id = ?`;
    
    db.run(sql, [requestId], function(err) {
        if (err || this.changes === 0) {
            console.error('Error rejecting matchmaking request:', err);
            return res.status(500).json({ error: 'Failed to reject request.' });
        }
        res.json({ message: 'Matchmaking request rejected successfully.' });
    });
});


app.get('/api/admin/matchmaking-requests', checkAdmin, (req, res) => {
    const sql = `
        SELECT
            m.id,
            u.name AS user_name,
            f.name AS field_name,
            m.slot_date,
            m.start_time,
            m.end_time,
            m.request_type,
            m.players_needed,
            m.status
        FROM matchmaking_requests m
        JOIN users u ON m.user_id = u.id
        JOIN fields f ON m.field_id = f.id
        ORDER BY m.created_at DESC;
    `;
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ requests: rows });
    });
});

// Team Building API Endpoints
app.post('/api/team-building/initiate', (req, res) => {
    const { userId, fieldId, slotDate, startTime, endTime, bookingType } = req.body;
    
    if (!userId || !fieldId || !slotDate || !startTime || !endTime || !bookingType) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }
    
    const invitationCode = crypto.randomBytes(8).toString('hex'); // Shorter, more practical code
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION;");
        
        // Check if the slot is already reserved or part of an active session
        const checkSlotSql = `SELECT is_reserved FROM availability_slots WHERE field_id = ? AND slot_date = ? AND start_time = ? AND is_reserved = 1`;
        db.get(checkSlotSql, [fieldId, slotDate, startTime], (err, row) => {
            if (err || (row && row.is_reserved === 1)) {
                db.run("ROLLBACK;");
                return res.status(409).json({ error: 'The selected time slot is already reserved.' });
            }

            // Determine initial team designation for the creator
            const teamDesignation = bookingType === 'two_teams_ready' ? 'A' : 'single';
            
            // 1. Create team building session
            const createSessionSql = `
                INSERT INTO team_sessions (
                    invitation_code, creator_id, field_id, slot_date, start_time, end_time, booking_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            db.run(createSessionSql, [invitationCode, userId, fieldId, slotDate, startTime, endTime, bookingType], function(err) {
                if (err) {
                    console.error('Error creating team session:', err);
                    db.run("ROLLBACK;");
                    return res.status(500).json({ error: 'Failed to create team session.' });
                }
                
                const sessionId = this.lastID;
                
                // 2. Add creator as first member
                const addMemberSql = `
                    INSERT INTO team_members (session_id, user_id, team_designation)
                    VALUES (?, ?, ?)
                `;
                
                db.run(addMemberSql, [sessionId, userId, teamDesignation], (memberErr) => {
                    if (memberErr) {
                        console.error('Error adding creator to team:', memberErr);
                        db.run("ROLLBACK;");
                        return res.status(500).json({ error: 'Failed to add creator to team.' });
                    }
                    
                    db.run("COMMIT;", (commitErr) => {
                        if (commitErr) {
                            console.error('Commit error:', commitErr);
                            return res.status(500).json({ error: 'Transaction failed.' });
                        }
                        res.json({ invitationCode, sessionId });
                    });
                });
            });
        });
    });
});

app.get('/api/team-building/:invitationCode', (req, res) => {
    const { invitationCode } = req.params;
    
    // 1. Get session details
    const sessionSql = `
        SELECT ts.*, f.name as field_name, f.location as field_address, f.image as field_image, f.price_per_hour
        FROM team_sessions ts
        JOIN fields f ON ts.field_id = f.id
        WHERE ts.invitation_code = ? AND ts.status = 'active'
    `;
    
    db.get(sessionSql, [invitationCode], (err, session) => {
        if (err || !session) {
            return res.status(404).json({ error: 'Team session not found or inactive.' });
        }
        
        // 2. Get team members
        const membersSql = `
            SELECT tm.id, tm.session_id, tm.user_id, u.name as player_name, tm.team_designation
            FROM team_members tm
            JOIN users u ON tm.user_id = u.id
            WHERE tm.session_id = ?
            ORDER BY tm.joined_at
        `;
        
        db.all(membersSql, [session.id], (membersErr, members) => {
            if (membersErr) {
                console.error('Error fetching team members:', membersErr);
                return res.status(500).json({ error: 'Failed to fetch team members.' });
            }
            
            // Convert field image to base64 if it exists
            if (session.field_image) {
                session.field_image = Buffer.from(session.field_image).toString('base64');
            }
            
            res.json({ session, members });
        });
    });
});

app.post('/api/team-building/join', (req, res) => {
    const { invitationCode, userId, teamDesignation } = req.body;
    
    if (!invitationCode || !userId || !['A', 'B', 'single'].includes(teamDesignation)) {
        return res.status(400).json({ error: 'Missing or invalid required fields (invitationCode, userId, teamDesignation).' });
    }
    
    // 1. Get the session
    const sessionSql = `SELECT * FROM team_sessions WHERE invitation_code = ? AND status = 'active'`;
    
    db.get(sessionSql, [invitationCode], (err, session) => {
        if (err || !session) {
            return res.status(404).json({ error: 'Team session not found or inactive.' });
        }
        
        // 2. Check if user is already in this session
        const checkMemberSql = `SELECT * FROM team_members WHERE session_id = ? AND user_id = ?`;
        
        db.get(checkMemberSql, [session.id, userId], (checkErr, existingMember) => {
            if (checkErr) {
                return res.status(500).json({ error: 'Database error during member check.' });
            }
            
            if (existingMember) {
                return res.status(400).json({ error: 'User already in this team session.' });
            }
            
            // 3. Check for team capacity limit (Option 3 only: team_looking_for_players max 5)
            if (session.booking_type === 'team_looking_for_players') {
                const countSql = `SELECT COUNT(*) as current_count FROM team_members WHERE session_id = ? AND team_designation = 'single'`;
                db.get(countSql, [session.id], (countErr, row) => {
                    if (countErr) return res.status(500).json({ error: 'Database error counting players.' });
                    
                    if (row.current_count >= 5) {
                        return res.status(400).json({ error: 'Team is full (max 5 players).' });
                    }
                    
                    // Proceed to add member
                    addMemberToTeam(session.id, userId, teamDesignation, res);
                });
            } else {
                 // Proceed to add member (no max limit for Option 1/2)
                addMemberToTeam(session.id, userId, teamDesignation, res);
            }
        });
    });
});

function addMemberToTeam(sessionId, userId, teamDesignation, res) {
    const addMemberSql = `
        INSERT INTO team_members (session_id, user_id, team_designation)
        VALUES (?, ?, ?)
    `;
    
    db.run(addMemberSql, [sessionId, userId, teamDesignation], function(addErr) {
        if (addErr) {
            console.error('Error adding team member:', addErr);
            return res.status(500).json({ error: 'Failed to join team.' });
        }
        
        res.json({ message: 'Successfully joined team.' });
    });
}

app.post('/api/team-building/remove-player', (req, res) => {
    const { invitationCode, userId, targetUserId } = req.body;
    
    if (!invitationCode || !userId || !targetUserId) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }
    
    // 1. Get session and verify user is creator
    const sessionSql = `SELECT * FROM team_sessions WHERE invitation_code = ? AND creator_id = ? AND status = 'active'`;
    
    db.get(sessionSql, [invitationCode, userId], (err, session) => {
        if (err || !session) {
            return res.status(403).json({ error: 'Unauthorized or session not found.' });
        }
        
        // Prevent creator from removing themselves
        if (parseInt(targetUserId) === parseInt(userId)) {
             return res.status(400).json({ error: 'Cannot remove the team creator.' });
        }
        
        // 2. Remove the target user
        const removeSql = `DELETE FROM team_members WHERE session_id = ? AND user_id = ?`;
        
        db.run(removeSql, [session.id, targetUserId], function(removeErr) {
            if (removeErr || this.changes === 0) {
                return res.status(500).json({ error: 'Failed to remove player.' });
            }
            
            res.json({ message: 'Player removed successfully.' });
        });
    });
});

// Option 1: Confirm Booking (Two Teams Ready)
app.post('/api/team-building/confirm-booking', (req, res) => {
    const { invitationCode, userId } = req.body;
    
    if (!invitationCode || !userId) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION;");
        
        // 1. Get session, verify user is creator, and check player counts
        const sessionSql = `SELECT * FROM team_sessions WHERE invitation_code = ? AND creator_id = ? AND status = 'active' AND booking_type = 'two_teams_ready'`;
        
        db.get(sessionSql, [invitationCode, userId], (err, session) => {
            if (err || !session) {
                db.run("ROLLBACK;");
                return res.status(403).json({ error: 'Unauthorized, session not found, or booking type mismatch.' });
            }
            
            const countSql = `SELECT team_designation, COUNT(*) as count FROM team_members WHERE session_id = ? GROUP BY team_designation`;
            db.all(countSql, [session.id], (countErr, results) => {
                if (countErr) {
                    db.run("ROLLBACK;");
                    return res.status(500).json({ error: 'Database error checking player counts.' });
                }
                
                const teamA = results.find(r => r.team_designation === 'A')?.count || 0;
                const teamB = results.find(r => r.team_designation === 'B')?.count || 0;
                
                if (teamA < 6 || teamB < 6) {
                    db.run("ROLLBACK;");
                    return res.status(400).json({ error: 'Reservation failed: Both teams must have at least 6 players.' });
                }

                // 2. Create availability slot reservation
                const reserveSql = `
                    UPDATE availability_slots 
                    SET is_reserved = 1, reservation_type = 'two_teams_ready', user_id = ? 
                    WHERE field_id = ? AND slot_date = ? AND start_time = ? AND is_reserved = 0
                `;
                
                db.run(reserveSql, [userId, session.field_id, session.slot_date, session.start_time], function(reserveErr) {
                    if (reserveErr || this.changes === 0) {
                        console.error('Error creating reservation:', reserveErr);
                        db.run("ROLLBACK;");
                        return res.status(500).json({ error: 'Failed to reserve the slot. It may already be taken.' });
                    }
                    
                    // 3. Update session status
                    const updateSessionSql = `UPDATE team_sessions SET status = 'completed' WHERE id = ?`;
                    
                    db.run(updateSessionSql, [session.id], (updateErr) => {
                        if (updateErr) {
                            console.error('Error updating session:', updateErr);
                            db.run("ROLLBACK;");
                            return res.status(500).json({ error: 'Failed to update session status.' });
                        }
                        
                        db.run("COMMIT;", (commitErr) => {
                            if (commitErr) {
                                console.error('Commit error:', commitErr);
                                return res.status(500).json({ error: 'Transaction failed.' });
                            }
                            res.json({ message: 'Booking confirmed successfully!' });
                        });
                    });
                });
            });
        });
    });
});

// Option 2 & 3: Submit Matchmaking Request
app.post('/api/team-building/submit-matchmaking', (req, res) => {
    const { invitationCode, userId, currentPlayers } = req.body;
    
    if (!invitationCode || !userId || typeof currentPlayers !== 'number') {
        return res.status(400).json({ error: 'Missing required fields or invalid player count.' });
    }
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION;");

        // 1. Get session and verify user is creator
        const sessionSql = `SELECT * FROM team_sessions WHERE invitation_code = ? AND creator_id = ? AND status = 'active' AND booking_type IN ('team_vs_team', 'team_looking_for_players')`;
        
        db.get(sessionSql, [invitationCode, userId], (err, session) => {
            if (err || !session) {
                db.run("ROLLBACK;");
                return res.status(403).json({ error: 'Unauthorized, session not found, or booking type mismatch.' });
            }
            
            const bookingType = session.booking_type;
            const requiredMin = bookingType === 'team_vs_team' ? 6 : 3;

            if (currentPlayers < requiredMin) {
                db.run("ROLLBACK;");
                return res.status(400).json({ error: `Matchmaking failed: Team must have at least ${requiredMin} players.` });
            }

            // 2. Calculate players needed for the *matchmaking pool*
            const playersNeededForPool = getPlayersNeededForMatchmaking(bookingType, currentPlayers);

            // 3. Create matchmaking request
            const matchmakingSql = `
                INSERT INTO matchmaking_requests (user_id, field_id, slot_date, start_time, end_time, request_type, players_needed)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            db.run(matchmakingSql, [userId, session.field_id, session.slot_date, session.start_time, session.end_time, bookingType, playersNeededForPool], function(matchErr) {
                if (matchErr) {
                    console.error('Error creating matchmaking request:', matchErr);
                    db.run("ROLLBACK;");
                    return res.status(500).json({ error: 'Failed to create matchmaking request.' });
                }
                
                // 4. Update session status
                const updateSessionSql = `UPDATE team_sessions SET status = 'completed' WHERE id = ?`;
                
                db.run(updateSessionSql, [session.id], (updateErr) => {
                    if (updateErr) {
                        console.error('Error updating session:', updateErr);
                        db.run("ROLLBACK;");
                        return res.status(500).json({ error: 'Failed to update session status.' });
                    }
                    
                    db.run("COMMIT;", (commitErr) => {
                        if (commitErr) {
                            console.error('Commit error:', commitErr);
                            return res.status(500).json({ error: 'Transaction failed.' });
                        }
                        res.json({ message: 'Matchmaking request submitted successfully!' });
                    });
                });
            });
        });
    });
});

// Helper function to calculate players needed for matchmaking
function getPlayersNeededForMatchmaking(bookingType, currentPlayers) {
    switch (bookingType) {
        case 'team_vs_team':
            // If team has 6 players, it needs 6 more for the opposing team (6v6).
            // We use 12 (6v6) as the standard game size.
            return 12 - currentPlayers; 
        case 'team_looking_for_players':
            // Team size is 5 max. If the team has N players, it needs (5 - N) individual players to complete the team.
            // Matchmaking goal is finding individual players to complete the team of 5.
            return 5 - currentPlayers; 
        case 'players_looking_for_team':
            // Single player needs 9 others for a 5v5 game (total 10 players). This is handled by direct /api/matchmake
            return 9; 
        default:
            return 0;
    }
}

// Route to serve main pages
app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/auth.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'auth.html'));
});

app.get('/admin-dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

app.get('/user-dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'user-dashboard.html'));
});

app.get('/tournaments.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'tournaments.html'));
});

app.get('/team-join.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'team-join.html'));
});

// Route to handle team-join URLs with invitation codes
app.get('/join/:invitationCode', (req, res) => {
    res.sendFile(path.join(__dirname, 'team-join.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
