const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const cors = require('cors');
require('dotenv').config();
// Import the PostgreSQL Pool from the new database file
const pool = require('./database');
const app = express();

// --- Configuration ---
const port = process.env.PORT || 3002;
const saltRounds = 10;

// =========================================================
// CORS: Simplified using standard middleware
// =========================================================
const allowedOrigins = [
    'https://www.5v5games.com',
    'https://5v5games.com',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
    'http://localhost',
    'http://127.0.0.1'
];

const corsOptions = {
    origin: (origin, callback) => {
        // Allow same-origin requests or tools without Origin header
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'X-User-Id', 'Authorization']
};

app.use(cors(corsOptions));
// Explicit OPTIONS for critical auth routes (helps certain proxies)
app.options('/api/signup', cors(corsOptions));
app.options('/api/login', cors(corsOptions));
// =========================================================

// Increase the JSON body size limit to handle image uploads
app.use(express.json({ limit: '50mb' }));
// Support form-encoded bodies for environments that block JSON POSTs
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'views')));
app.use(express.static(path.join(__dirname, 'components')));


// --- Database Schema Initialization ---
(async () => {
    console.log('Initializing database schema...');
    try {
        // Use pool.query for schema initialization
        await pool.query(`
            -- USERS Table
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                phone_number TEXT,
                birthdate TEXT,
                gender TEXT,
                password TEXT NOT NULL,
                is_admin INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- Ensure columns are present (safe to run multiple times)
            ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin INTEGER DEFAULT 0;

            -- FIELDS Table
            CREATE TABLE IF NOT EXISTS fields (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                location TEXT,
                image BYTEA, 
                price_per_hour REAL
            );

            -- AVAILABILITY_SLOTS Table
            CREATE TABLE IF NOT EXISTS availability_slots (
                id SERIAL PRIMARY KEY,
                field_id INTEGER NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
                slot_date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                is_reserved INTEGER DEFAULT 0,
                reservation_type TEXT,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
            );
            -- MATCHMAKING_REQUESTS Table
            CREATE TABLE IF NOT EXISTS matchmaking_requests (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                field_id INTEGER NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
                slot_date TEXT NOT NULL,
                start_time TEXT,
                end_time TEXT,
                request_type TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                players_needed INTEGER,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            -- Ensure matchmaking_requests allows NULL times for day-only matching
            ALTER TABLE matchmaking_requests ALTER COLUMN start_time DROP NOT NULL;
            ALTER TABLE matchmaking_requests ALTER COLUMN end_time DROP NOT NULL;
            
            -- TOURNAMENTS Table
            CREATE TABLE IF NOT EXISTS tournaments (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                field_id INTEGER NOT NULL REFERENCES fields(id) ON DELETE RESTRICT,
                tournament_date TEXT NOT NULL,
                prize TEXT,
                description TEXT,
                image_data BYTEA,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            -- TEAM_SESSIONS Table (For Field Booking/Matchmaking Pre-reg)
            CREATE TABLE IF NOT EXISTS team_sessions (
                id SERIAL PRIMARY KEY,
                invitation_code TEXT UNIQUE NOT NULL,
                creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                booking_type TEXT NOT NULL, -- e.g., 'two_teams_ready', 'team_vs_team'
                field_id INTEGER REFERENCES fields(id) ON DELETE SET NULL,
                slot_date TEXT,
                start_time TEXT,
                end_time TEXT,
                status TEXT DEFAULT 'active', -- 'active', 'completed', 'cancelled'
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                -- Tournament-related columns (needed for some logic in original code)
                tournament_id INTEGER REFERENCES tournaments(id) ON DELETE SET NULL,
                team_name TEXT,
                captain_id INTEGER REFERENCES users(id) ON DELETE SET NULL 
            );
            -- Ensure team_sessions allows NULL times when matching by day only
            ALTER TABLE team_sessions ALTER COLUMN start_time DROP NOT NULL;
            ALTER TABLE team_sessions ALTER COLUMN end_time DROP NOT NULL;
            
            -- RESERVATIONS Table (Confirmed bookings separate from matchmaking requests)
            -- Note: depends on team_sessions existing for the foreign key
            CREATE TABLE IF NOT EXISTS reservations (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                field_id INTEGER NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
                slot_date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                booking_type TEXT NOT NULL, -- e.g., 'two_teams_ready'
                session_id INTEGER REFERENCES team_sessions(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            -- TEAM_MEMBERS Table (Members of a booking/matchmaking team session)
            CREATE TABLE IF NOT EXISTS team_members (
                id SERIAL PRIMARY KEY,
                session_id INTEGER NOT NULL REFERENCES team_sessions(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                team_designation TEXT NOT NULL, -- 'A', 'B', or 'single'
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (session_id, user_id)
            );
            
            -- TOURNAMENT_TEAMS Table (Actual teams registered for a tournament)
            CREATE TABLE IF NOT EXISTS tournament_teams (
                id SERIAL PRIMARY KEY,
                tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
                team_name TEXT NOT NULL,
                captain_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                session_id INTEGER REFERENCES team_sessions(id) ON DELETE SET NULL, -- Link to a booking session if applicable
                invitation_code TEXT UNIQUE,
                status TEXT DEFAULT 'forming', -- 'forming', 'registered'
                registration_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- TOURNAMENT_TEAM_MEMBERS Table (Members of an official tournament team)
            CREATE TABLE IF NOT EXISTS tournament_team_members (
                id SERIAL PRIMARY KEY,
                team_id INTEGER NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                user_name TEXT NOT NULL,
                is_captain INTEGER DEFAULT 0,
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (team_id, user_id)
            );

            -- Cleanup of redundant legacy tables (if they exist)
            DROP TABLE IF EXISTS tournament_participations;
            DROP TABLE IF EXISTS team_session_members; -- Replacing with tournament_team_members
        `);
        
        console.log('Database schema successfully initialized/checked.');
    } catch (err) {
        console.error('Error initializing database schema:', err.message);
    }
})();


// --- Middleware ---

// Security middleware to check for admin
const checkAdmin = async (req, res, next) => {
    const query = req.query || {};
    const body = req.body || {};
    const headers = req.headers || {};
    
    // User ID can come from query, body, or custom header
    const userId = query.userId || body.userId || headers['x-user-id'];
    
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized. User ID is required.' });
    }

    // Use $1 for PostgreSQL parameterized queries
    const sql = `SELECT is_admin FROM users WHERE id = $1`;
    try {
        const { rows } = await pool.query(sql, [userId]);
        const row = rows[0];

        if (!row) {
            return res.status(401).json({ error: 'Unauthorized. User not found.' });
        }
        if (row.is_admin !== 1) {
            return res.status(403).json({ error: 'Forbidden. You do not have administrator access.' });
        }
        next();
    } catch (err) {
        console.error('Database error in checkAdmin:', err);
        return res.status(500).json({ error: 'Database error during authentication check.' });
    }
};


// --- User API Endpoints ---

// API endpoint to get all fields
app.get('/api/fields', async (req, res) => {
    const sql = `SELECT * FROM fields`;
    try {
        const { rows } = await pool.query(sql);
        const fieldsWithBase64 = rows.map(field => {
            if (field.image) {
                // PostgreSQL BYTEA is returned as a Buffer
                field.image = Buffer.from(field.image).toString('base64');
            }
            return field;
        });
        res.json({ fields: fieldsWithBase64 });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// API endpoint to get a single field's details
app.get('/api/fields/:fieldId', async (req, res) => {
    const { fieldId } = req.params;
    const sql = `SELECT * FROM fields WHERE id = $1`;
    try {
        const { rows } = await pool.query(sql, [fieldId]);
        const row = rows[0];
        
        if (!row) {
            return res.status(404).json({ error: 'Field not found' });
        }
        if (row.image) {
            row.image = Buffer.from(row.image).toString('base64');
        }
        res.json({ field: row });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// API endpoint to get availability for a specific field
app.get('/api/availability/:fieldId', async (req, res) => {
    const { fieldId } = req.params;
    const { date } = req.query; 
    
    if (!date) {
        return res.status(400).json({ error: 'Date parameter is required.' });
    }

    const sql = `SELECT * FROM availability_slots WHERE field_id = $1 AND slot_date = $2 AND is_reserved = 0`;
    try {
        const { rows } = await pool.query(sql, [fieldId, date]);
        res.json({ availability: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// API endpoint for user sign-up
app.post('/api/signup', async (req, res) => {
    const { name, email, phone, birthdate, gender, password } = req.body;

    if (!name || !email || !phone || !birthdate || !gender || !password) {
        return res.status(400).json({ error: 'يرجى توفير جميع الحقول المطلوبة.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Enforce: no admin creation via signup; always regular user
        const isAdminValue = 0;

        const sql = `
            INSERT INTO users (name, email, phone_number, birthdate, gender, password, is_admin) 
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id -- Use RETURNING to get the new ID
        `;
        const params = [name, email, phone, birthdate, gender, hashedPassword, isAdminValue];
        
        const { rows } = await pool.query(sql, params);
        const userId = rows[0].id;

        res.status(201).json({ message: 'تم إنشاء الحساب بنجاح.', userId });
    } catch (err) {
        console.error('Error inserting user:', err);
        // PostgreSQL duplicate key error code is '23505'
        if (err.code === '23505') {
            return res.status(409).json({ error: 'هذا البريد الإلكتروني مسجل بالفعل.' });
        }
        return res.status(500).json({ error: 'تعذر إنشاء الحساب.' });
    }
});

// API endpoint for user login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبة.' });
    }

    const sql = `SELECT id, name, email, password, is_admin FROM users WHERE email = $1`;
    try {
        const { rows } = await pool.query(sql, [email]);
        const user = rows[0];

        if (!user) {
            return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
        }

        const match = await bcrypt.compare(password, user.password);

        if (match) {
            res.json({ 
                message: 'تم تسجيل الدخول بنجاح.', 
                userId: user.id, 
                userName: user.name, 
                email: user.email,
                isAdmin: user.is_admin === 1
            });
        } else {
            res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
        }
    } catch (err) {
        console.error('Error fetching user:', err);
        return res.status(500).json({ error: 'خطأ في الخادم. يرجى المحاولة لاحقاً.' });
    }
});

// API endpoint to get user reservations
app.get('/api/user/reservations/:userId', async (req, res) => {
    const { userId } = req.params;
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required.' });
    }
    const sql = `
        SELECT
            r.id,
            r.slot_date,
            r.start_time,
            r.end_time,
            r.booking_type,
            'confirmed' as status,
            f.name AS field_name,
            f.price_per_hour
        FROM reservations r
        LEFT JOIN fields f ON r.field_id = f.id
        WHERE r.user_id = $1
        ORDER BY r.slot_date DESC, r.start_time DESC;
    `;
    try {
        const { rows } = await pool.query(sql, [userId]);
        res.json({ reservations: rows });
    } catch (err) {
        console.error('Error fetching user reservations:', err);
        return res.status(500).json({ error: err.message });
    }
});

// API endpoint to get a user's profile information
app.get('/api/user/:userId', async (req, res) => {
    const { userId } = req.params;
    const sql = `SELECT id, name, email, phone_number, birthdate, gender, is_admin FROM users WHERE id = $1`;
    try {
        const { rows } = await pool.query(sql, [userId]);
        const row = rows[0];

        if (!row) {
            return res.status(404).json({ error: 'User not found.' });
        }
        res.json({ user: row });
    } catch (err) {
        console.error('Error fetching user:', err);
        return res.status(500).json({ error: err.message });
    }
});

// API endpoint to get users with birthdays in the upcoming week
app.get('/api/users/upcoming-birthdays', async (req, res) => {
    const today = new Date();
    
    // Calculate the MM-DD string for today and the next 7 days
    const dates = [];
    for (let i = 0; i <= 7; i++) {
        const date = new Date();
        date.setDate(today.getDate() + i);
        dates.push(String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'));
    }
    
    // Query for users whose birthdate MM-DD part matches any of the calculated dates
    const sql = `
        SELECT id, name, email, phone_number, birthdate, gender FROM users 
        WHERE TO_CHAR(TO_DATE(birthdate, 'YYYY-MM-DD'), 'MM-DD') = ANY($1::text[])
        AND birthdate IS NOT NULL
    `;
    
    try {
        const { rows } = await pool.query(sql, [dates]);
        
        // Sort in memory by birthday date (month-day)
        const sortedUsers = rows.sort((a, b) => {
            const aDate = new Date(a.birthdate);
            const bDate = new Date(b.birthdate);
            const aFormatted = String(aDate.getMonth() + 1).padStart(2, '0') + '-' + String(aDate.getDate()).padStart(2, '0');
            const bFormatted = String(bDate.getMonth() + 1).padStart(2, '0') + '-' + String(bDate.getDate()).padStart(2, '0');
            return aFormatted.localeCompare(bFormatted);
        });
        
        res.json({ users: sortedUsers });
    } catch (err) {
        console.error('Error fetching birthday users:', err);
        return res.status(500).json({ error: err.message });
    }
});

// API for direct reservations (only for 'full_field' bookings)
app.post('/api/reserve', async (req, res) => {
    const { userId, slotId } = req.body;
    if (!userId || !slotId) {
        return res.status(400).json({ error: 'All reservation details are required.' });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN"); // Start transaction

        // 1. Check if the slot is already reserved (and get details)
        const checkSql = `SELECT is_reserved FROM availability_slots WHERE id = $1 FOR UPDATE`; // FOR UPDATE locks the row
        const checkResult = await client.query(checkSql, [slotId]);
        const row = checkResult.rows[0];
        
        if (!row) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: 'Selected slot not found.' });
        }
        if (row.is_reserved === 1) {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: 'Failed to reserve the slot. It may already be taken.' });
        }

        // 2. Update the slot
        const updateSql = `
            UPDATE availability_slots 
            SET is_reserved = 1, reservation_type = 'full_field', user_id = $1 
            WHERE id = $2
        `;
        const updateResult = await client.query(updateSql, [userId, slotId]);
        
        if (updateResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(500).json({ error: 'Failed to reserve the slot (0 rows updated).' });
        }
        // 3. Insert reservation record using slot details
        const slotDetailsSql = `SELECT field_id, slot_date, start_time, end_time FROM availability_slots WHERE id = $1`;
        const { rows: slotDetailsRows } = await client.query(slotDetailsSql, [slotId]);
        const slotDetails = slotDetailsRows[0];
        if (!slotDetails) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Slot details not found after update.' });
        }

        const insertReservationSql = `
            INSERT INTO reservations (user_id, field_id, slot_date, start_time, end_time, booking_type)
            VALUES ($1, $2, $3, $4, $5, 'full_field')
        `;
        await client.query(insertReservationSql, [userId, slotDetails.field_id, slotDetails.slot_date, slotDetails.start_time, slotDetails.end_time]);

        await client.query("COMMIT"); // Commit transaction
        res.json({ message: 'Reservation confirmed successfully!' });

    } catch (err) {
        await client.query("ROLLBACK"); // Rollback on any error
        console.error('Transaction error in /api/reserve:', err);
        return res.status(500).json({ error: 'Failed to complete reservation due to a server error.' });
    } finally {
        client.release();
    }
});

// API for handling all types of matchmaking requests (Option 4: Player looking for a team)
app.post('/api/matchmake', async (req, res) => {
    const { userId, fieldId, slotId, slotDate, requestType } = req.body;
    
    if (!userId || !fieldId || (!slotId && !slotDate) || !requestType) {
        return res.status(400).json({ error: 'All required fields must be provided.' });
    }
    
    if (requestType !== 'players_looking_for_team') {
         return res.status(400).json({ error: 'Invalid request type for direct matchmaking.' });
    }
    
    try {
        let effectiveDate = slotDate;
        if (slotId) {
            // Get slot details (date) from the slotId
            const slotSql = `SELECT slot_date FROM availability_slots WHERE id = $1`;
            const { rows: slotRows } = await pool.query(slotSql, [slotId]);
            const slot = slotRows[0];
            if (!slot) {
                return res.status(404).json({ error: 'The selected time slot does not exist.' });
            }
            effectiveDate = slot.slot_date;
        }

        // Insert a new record into the matchmaking_requests table with null times for day-only
        const insertSql = `
            INSERT INTO matchmaking_requests (
                user_id, field_id, slot_date, start_time, end_time, request_type, players_needed
            ) VALUES ($1, $2, $3, NULL, NULL, $4, $5)
            RETURNING id
        `;
        const insertResult = await pool.query(insertSql, [
            userId, fieldId, effectiveDate, requestType, 1
        ]);

        res.status(201).json({
            message: 'Matchmaking request submitted successfully. You will be notified when a match is found.',
            requestId: insertResult.rows[0].id
        });
        
    } catch (err) {
        console.error('Error inserting matchmaking request:', err);
        return res.status(500).json({ error: 'Failed to submit matchmaking request.' });
    }
});


// --- Admin API Endpoints (all require checkAdmin middleware) ---

// Get all fields (Admin)
app.get('/api/admin/fields', checkAdmin, async (req, res) => {
    const sql = `SELECT id, name, description, location, image, price_per_hour FROM fields`;
    try {
        const { rows } = await pool.query(sql);
        const fieldsWithBase64 = rows.map(field => {
            if (field.image) {
                field.image = Buffer.from(field.image).toString('base64');
            }
            return field;
        });
        res.json({ fields: fieldsWithBase64 });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Endpoint to get all availability slots (for admin view)
app.get('/api/admin/availability', checkAdmin, async (req, res) => {
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
    let paramIndex = 1;
    
    if (fieldId) {
        conditions.push(`r.field_id = $${paramIndex++}`);
        params.push(fieldId);
    }
    
    if (date) {
        conditions.push(`r.slot_date = $${paramIndex++}`);
        params.push(date);
    }
    
    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' ORDER BY r.slot_date DESC, r.start_time ASC';
    
    try {
        const { rows } = await pool.query(sql, params);
        res.json({ availability: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Endpoint to get all availability slots for a given field and date (for admin view)
app.get('/api/admin/availability/:fieldId', checkAdmin, async (req, res) => {
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
        WHERE r.field_id = $1 AND r.slot_date = $2
        ORDER BY r.start_time ASC;
    `;
    try {
        const { rows } = await pool.query(sql, [fieldId, date]);
        res.json({ availability: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Add new field (Admin)
app.post('/api/admin/fields', checkAdmin, async (req, res) => {
    const { name, description, location, image, pricePerHour } = req.body;
    if (!name || !location || !pricePerHour) {
        return res.status(400).json({ error: 'Name, location, and price per hour are required.' });
    }
    const sql = `INSERT INTO fields (name, description, location, image, price_per_hour) VALUES ($1, $2, $3, $4, $5) RETURNING id`;
    
    try {
        const base64Data = image.split(',')[1] || image;
        const imageData = Buffer.from(base64Data, 'base64');
        
        const { rows } = await pool.query(sql, [name, description, location, imageData, pricePerHour]);
        res.status(201).json({ message: 'Field added successfully', fieldId: rows[0].id });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Update field (Admin)
app.put('/api/admin/fields/:fieldId', checkAdmin, async (req, res) => {
    const { fieldId } = req.params;
    const { name, description, location, image, pricePerHour } = req.body;
    if (!name || !location || !pricePerHour) {
        return res.status(400).json({ error: 'All fields are required to update.' });
    }
    const sql = `UPDATE fields SET name = $1, description = $2, location = $3, image = $4, price_per_hour = $5 WHERE id = $6`;
    
    try {
        const base64Data = image.split(',')[1] || image;
        const imageData = Buffer.from(base64Data, 'base64');
        
        const result = await pool.query(sql, [name, description, location, imageData, pricePerHour, fieldId]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Field not found.' });
        }
        res.json({ message: 'Field updated successfully.' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update field: ' + err.message });
    }
});

// Delete field (Admin)
app.delete('/api/admin/fields/:fieldId', checkAdmin, async (req, res) => {
    const { fieldId } = req.params;
    try {
        const result = await pool.query(`DELETE FROM fields WHERE id = $1`, [fieldId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Field not found.' });
        }
        res.json({ message: 'Field deleted successfully.' });
    } catch (err) {
        // Foreign key violation
        if (err.code === '23503') { 
             return res.status(400).json({ error: 'Cannot delete field because it is referenced by existing availability slots or tournaments.' });
        }
        return res.status(500).json({ error: 'Failed to delete field: ' + err.message });
    }
});

// Add availability slots (Admin)
app.post('/api/admin/availability', checkAdmin, async (req, res) => {
    const { fieldId, date, slots } = req.body;
    if (!fieldId || !date || !slots || !Array.isArray(slots) || slots.length === 0) {
        return res.status(400).json({ error: 'Field ID, date, and a non-empty array of slots are required.' });
    }
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        
        const insertSql = `
            INSERT INTO availability_slots (field_id, slot_date, start_time, end_time) 
            VALUES ($1, $2, $3, $4)
        `;
        
        for (const slot of slots) {
            await client.query(insertSql, [fieldId, date, slot.start, slot.end]);
        }
        
        await client.query("COMMIT");
        res.status(201).json({ message: 'Availability slots added successfully.' });
        
    } catch (err) {
        await client.query("ROLLBACK");
        console.error('Transaction error adding availability slots:', err);
        return res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Get all reservations (Admin)
app.get('/api/admin/reservations', checkAdmin, async (req, res) => {
    const sql = `
        SELECT
            r.id,
            u.name AS user_name,
            f.name AS field_name,
            r.slot_date,
            r.start_time,
            r.end_time,
            r.booking_type,
            f.price_per_hour
        FROM reservations r
        JOIN fields f ON r.field_id = f.id
        JOIN users u ON r.user_id = u.id
        ORDER BY r.slot_date DESC, r.start_time DESC;
    `;
    try {
        const { rows } = await pool.query(sql);
        res.json({ reservations: rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Reject reservation request (Admin)
app.put('/api/admin/reservations/:id/reject', checkAdmin, async (req, res) => {
    const reservationId = req.params.id;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lock reservation row
        const { rows } = await client.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [reservationId]);
        const reservation = rows[0];
        if (!reservation) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Reservation not found' });
        }

        // Free the corresponding availability slot
        const freeSql = `
            UPDATE availability_slots
            SET is_reserved = 0, user_id = NULL, reservation_type = NULL
            WHERE field_id = $1 AND slot_date = $2 AND start_time = $3 AND end_time = $4 AND is_reserved = 1
        `;
        const freeRes = await client.query(freeSql, [reservation.field_id, reservation.slot_date, reservation.start_time, reservation.end_time]);
        if (freeRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Availability slot not found or already free' });
        }

        // Delete the reservation
        await client.query('DELETE FROM reservations WHERE id = $1', [reservationId]);

        await client.query('COMMIT');
        res.json({ message: 'Reservation rejected successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
    } finally {
        client.release();
    }
});

// Cancel confirmed reservation (Admin)
app.put('/api/admin/reservations/:id/cancel', checkAdmin, async (req, res) => {
    const reservationId = req.params.id;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lock reservation row
        const { rows } = await client.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [reservationId]);
        const reservation = rows[0];
        if (!reservation) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Reservation not found' });
        }

        // Free the corresponding availability slot
        const freeSql = `
            UPDATE availability_slots
            SET is_reserved = 0, user_id = NULL, reservation_type = NULL
            WHERE field_id = $1 AND slot_date = $2 AND start_time = $3 AND end_time = $4 AND is_reserved = 1
        `;
        const freeRes = await client.query(freeSql, [reservation.field_id, reservation.slot_date, reservation.start_time, reservation.end_time]);
        if (freeRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Availability slot not found or already free' });
        }

        // Delete the reservation
        await client.query('DELETE FROM reservations WHERE id = $1', [reservationId]);

        await client.query('COMMIT');
        res.json({ message: 'Reservation cancelled successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
    } finally {
        client.release();
    }
});

// Delete availability slot (Admin)
app.delete('/api/admin/availability/:id', checkAdmin, async (req, res) => {
    const slotId = req.params.id;
    
    const query = 'DELETE FROM availability_slots WHERE id = $1';
    
    try {
        const result = await pool.query(query, [slotId]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Availability slot not found' });
        }
        
        res.json({ message: 'Availability slot deleted successfully' });
    } catch (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
    }
});

// Update availability slot (Admin)
app.put('/api/admin/availability/:id', checkAdmin, async (req, res) => {
    const slotId = req.params.id;
    const { start_time, end_time, slot_date, field_id } = req.body;
    
    if (!start_time || !end_time || !slot_date || !field_id) {
        return res.status(400).json({ error: 'All fields are required: start_time, end_time, slot_date, field_id' });
    }
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        
        // 1. Check if the slot is reserved before updating (FOR UPDATE lock)
        const checkQuery = 'SELECT is_reserved FROM availability_slots WHERE id = $1 FOR UPDATE';
        const checkResult = await client.query(checkQuery, [slotId]);
        const row = checkResult.rows[0];
        
        if (!row) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: 'Availability slot not found' });
        }
        
        if (row.is_reserved) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'Cannot update a reserved slot' });
        }
        
        // 2. Update the slot
        const updateQuery = 'UPDATE availability_slots SET start_time = $1, end_time = $2, slot_date = $3, field_id = $4 WHERE id = $5';
        
        const updateResult = await client.query(updateQuery, [start_time, end_time, slot_date, field_id, slotId]);
        
        if (updateResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: 'Availability slot not found (after check)' });
        }
        
        await client.query("COMMIT");
        res.json({ message: 'Availability slot updated successfully' });
        
    } catch (err) {
        await client.query("ROLLBACK");
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
    } finally {
        client.release();
    }
});


// --- Tournament Endpoints ---

// Get all tournaments (Public)
app.get('/api/tournaments', async (req, res) => {
    const sql = `
        SELECT
            t.id, t.name, t.tournament_date, t.prize, t.description, t.image_data,
            f.name AS field_name, f.image as field_image
        FROM tournaments t
        JOIN fields f ON t.field_id = f.id
        ORDER BY t.tournament_date ASC;
    `;
    try {
        const { rows } = await pool.query(sql);
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
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Create new tournament (Admin)
app.post('/api/admin/tournaments', checkAdmin, async (req, res) => {
    const { name, fieldId, date, prize, image, description } = req.body;
    if (!name || !fieldId || !date || !prize || !image) {
        return res.status(400).json({ error: 'Tournament name, field, date, prize, and image are required.' });
    }
    const sql = `INSERT INTO tournaments (name, field_id, tournament_date, prize, image_data, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`;
    
    try {
        const base64Data = image.split(',')[1] || image;
        const imageData = Buffer.from(base64Data, 'base64');
        
        const { rows } = await pool.query(sql, [name, fieldId, date, prize, imageData, description]);
        res.status(201).json({ message: 'Tournament added successfully', tournamentId: rows[0].id });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Delete tournament (Admin)
app.delete('/api/admin/tournaments/:tournamentId', checkAdmin, async (req, res) => {
    const { tournamentId } = req.params;
    const sql = `DELETE FROM tournaments WHERE id = $1`;
    try {
        const result = await pool.query(sql, [tournamentId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Tournament not found.' });
        }
        res.json({ message: 'Tournament deleted successfully!' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to delete tournament: ' + err.message });
    }
});


// Get single tournament details (Public)
app.get('/api/tournaments/:tournamentId', async (req, res) => {
    const { tournamentId } = req.params;
    
    const sql = `
        SELECT
            t.id, t.name, t.tournament_date, t.prize, t.description, t.image_data,
            f.name AS field_name, f.image as field_image, f.id as field_id
        FROM tournaments t
        JOIN fields f ON t.field_id = f.id
        WHERE t.id = $1;
    `;
    
    try {
        const { rows } = await pool.query(sql, [tournamentId]);
        const row = rows[0];

        if (!row) {
            return res.status(404).json({ error: 'Tournament not found' });
        }
        
        if (row.image_data) {
            row.image = Buffer.from(row.image_data).toString('base64');
        }
        
        res.json({ tournament: row });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Public endpoint to get tournament teams (Modified to fetch all forming/registered teams and details)
app.get('/api/tournaments/:tournamentId/teams', async (req, res) => {
    const { tournamentId } = req.params;
    
    try {
        // 1. Get tournament info
        const tournamentSql = 'SELECT name FROM tournaments WHERE id = $1';
        const { rows: tournamentRows } = await pool.query(tournamentSql, [tournamentId]);
        const tournament = tournamentRows[0];

        if (!tournament) {
            return res.status(404).json({ success: false, message: 'البطولة غير موجودة' });
        }
        
        // 2. Get registered and forming teams for this tournament
        const teamsSql = `
            SELECT 
                tt.team_name,
                u.name as captain_name,
                tt.registration_date,
                tt.status,           -- Added status
                tt.invitation_code   -- Added invitation code for joining/viewing link
            FROM tournament_teams tt
            JOIN users u ON tt.captain_id = u.id
            WHERE tt.tournament_id = $1 
            ORDER BY tt.registration_date ASC
        `;
        
        const { rows: teams } = await pool.query(teamsSql, [tournamentId]);
            
        res.json({ 
            success: true, 
            tournament: tournament,
            teams: teams || []
        });
    } catch (err) {
        console.error('Error fetching public tournament teams:', err);
        return res.status(500).json({ success: false, message: 'خطأ في تحميل الفرق' });
    }
});

// Create new tournament team (Captain pre-registration)
app.post('/api/team-signup/create', async (req, res) => {
    const { tournamentId, teamName, creatorId, creatorName } = req.body;
    
    if (!tournamentId || !teamName || !creatorId || !creatorName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const invitationCode = crypto.randomBytes(16).toString('hex');
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Check if user has already created a team for this tournament
        const checkExistingSql = `SELECT id, invitation_code, team_name FROM tournament_teams WHERE tournament_id = $1 AND captain_id = $2`;
        const checkExistingRes = await client.query(checkExistingSql, [tournamentId, creatorId]);
        if (checkExistingRes.rows.length > 0) {
             await client.query("ROLLBACK");
             const existingTeam = checkExistingRes.rows[0];
             return res.status(400).json({ 
                 error: `لقد قمت بإنشاء فريق بالفعل (${existingTeam.team_name}) لهذه البطولة.`,
                 invitationCode: existingTeam.invitation_code
             });
        }


        // 2. Create tournament team
        const createTeamSql = `
            INSERT INTO tournament_teams (tournament_id, team_name, captain_id, invitation_code, status, registration_date)
            VALUES ($1, $2, $3, $4, 'forming', NOW())
            RETURNING id
        `;
        
        const createResult = await client.query(createTeamSql, [tournamentId, teamName, creatorId, invitationCode]);
        const teamId = createResult.rows[0].id;
        
        // 3. Add creator as first team member (captain)
        const addCreatorSql = `
            INSERT INTO tournament_team_members (team_id, user_id, user_name, is_captain, joined_at)
            VALUES ($1, $2, $3, 1, NOW())
        `;
        
        await client.query(addCreatorSql, [teamId, creatorId, creatorName]); // NOTE: Corrected the creatorName/creatorId mapping in the previous version, ensuring correct data types are passed here.
            
        await client.query("COMMIT");
        
        res.status(201).json({
            team: {
                id: teamId,
                name: teamName,
                captain_id: creatorId,
                invitation_code: invitationCode
            },
            invitationCode: invitationCode,
            creator: {
                user_id: creatorId,
                name: creatorName
            }
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error('Error creating tournament team:', err);
        return res.status(500).json({ error: 'Failed to create team: ' + err.message });
    } finally {
        client.release();
    }
});

// Get team details by invitation code (for tournament-team-hub.html)
app.get('/api/team-signup/:invitationCode', async (req, res) => {
    const { invitationCode } = req.params;
    
    try {
        // 1. Get team details (FIXED SQL JOIN for field details)
        const teamSql = `
            SELECT tt.*, t.name as tournament_name, t.tournament_date, t.prize, t.description,
                   f.name as field_name, f.location as field_location
            FROM tournament_teams tt
            JOIN tournaments t ON tt.tournament_id = t.id
            JOIN fields f ON t.field_id = f.id 
            WHERE tt.invitation_code = $1
        `;
        
        const { rows: teamRows } = await pool.query(teamSql, [invitationCode]);
        const team = teamRows[0];

        if (!team) {
            return res.status(404).json({ error: 'Invalid invitation code' });
        }
        
        // 2. Get team members
        const membersSql = `
            SELECT user_id, user_name, is_captain, joined_at
            FROM tournament_team_members
            WHERE team_id = $1
            ORDER BY is_captain DESC, joined_at ASC
        `;
        
        const { rows: members } = await pool.query(membersSql, [team.id]);

        res.json({
            team: {
                id: team.id,
                team_name: team.team_name,
                captain_id: team.captain_id,
                invitation_code: team.invitation_code,
                status: team.status,
                tournament_id: team.tournament_id,
            },
            tournament: {
                id: team.tournament_id,
                name: team.tournament_name,
                tournament_date: team.tournament_date,
                prize: team.prize,
                description: team.description,
                field_name: team.field_name,
                field_location: team.field_location
            },
            players: members || []
        });
    } catch (err) {
        console.error('Error fetching team:', err);
        return res.status(500).json({ error: 'Database error' });
    }
});

// Join tournament team
app.post('/api/team-signup/join', async (req, res) => {
    const { invitationCode, userId, userName } = req.body;
    
    if (!invitationCode || !userId || !userName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        
        // 1. Get team details (FOR UPDATE lock)
        const teamSql = `SELECT id, status FROM tournament_teams WHERE invitation_code = $1 FOR UPDATE`;
        const { rows: teamRows } = await client.query(teamSql, [invitationCode]);
        const team = teamRows[0];

        if (!team) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: 'Invalid invitation code' });
        }
        
        if (team.status !== 'forming') {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'Team is no longer accepting members' });
        }
        
        // 2. Check team size limit (max 8 players total)
        const countSql = `SELECT COUNT(*) as count FROM tournament_team_members WHERE team_id = $1`;
        const countResult = await client.query(countSql, [team.id]);
        
        if (parseInt(countResult.rows[0].count) >= 8) { // MAX_TEAM_SIZE
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'Team is full' });
        }
        
        // 3. Add user to team
        const addMemberSql = `
            INSERT INTO tournament_team_members (team_id, user_id, user_name, is_captain, joined_at)
            VALUES ($1, $2, $3, 0, NOW())
        `;
        
        await client.query(addMemberSql, [team.id, userId, userName]);

        await client.query("COMMIT");
        res.json({ message: 'Successfully joined team' });
        
    } catch (err) {
        await client.query("ROLLBACK");
        // Check for unique constraint violation (user already in team)
        if (err.code === '23505') { 
            return res.status(400).json({ error: 'User already in team' });
        }
        console.error('Error joining team:', err);
        return res.status(500).json({ error: 'Failed to join team' });
    } finally {
        client.release();
    }
});

// Remove player from team (Captain only)
app.post('/api/team-signup/remove-player', async (req, res) => {
    const { invitationCode, userId, targetUserId } = req.body;
    
    if (!invitationCode || !userId || !targetUserId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        
        // 1. Get team details and ensure userId is the captain (FOR UPDATE lock)
        const teamSql = `SELECT id, captain_id FROM tournament_teams WHERE invitation_code = $1 FOR UPDATE`;
        const { rows: teamRows } = await client.query(teamSql, [invitationCode]);
        const team = teamRows[0];

        if (!team) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: 'Invalid invitation code' });
        }
        
        if (parseInt(team.captain_id) !== parseInt(userId)) {
             await client.query("ROLLBACK");
            return res.status(403).json({ error: 'Unauthorized. Only the captain can remove players.' });
        }

        // 2. Remove player from team (cannot remove captain, is_captain = 0)
        const removeSql = `
            DELETE FROM tournament_team_members 
            WHERE team_id = $1 AND user_id = $2 AND is_captain = 0
        `;
        
        const result = await client.query(removeSql, [team.id, targetUserId]);

        if (result.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'Player not found or cannot be removed (must not be captain).' });
        }
        
        await client.query("COMMIT");
        res.json({ message: 'Player removed successfully' });
        
    } catch (err) {
        await client.query("ROLLBACK");
        console.error('Error removing player:', err);
        return res.status(500).json({ error: 'Failed to remove player' });
    } finally {
        client.release();
    }
});

// Confirm team registration for tournament (Captain only, when team is full)
app.post('/api/team-signup/confirm', async (req, res) => {
    const { invitationCode, tournamentId, captainId } = req.body;
    
    if (!invitationCode || !tournamentId || !captainId) {
        return res.status(400).json({ error: 'Missing required fields (invitationCode, tournamentId, captainId)' });
    }
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        
        // 1. Get team details and member count (FOR UPDATE lock)
        const teamSql = `
            SELECT tt.id, tt.team_name, tt.captain_id, 
                   (SELECT COUNT(*) FROM tournament_team_members ttm WHERE ttm.team_id = tt.id) as member_count
            FROM tournament_teams tt
            WHERE tt.invitation_code = $1 AND tt.tournament_id = $2 AND tt.captain_id = $3
            FOR UPDATE
        `;
        
        const { rows: teamRows } = await client.query(teamSql, [invitationCode, tournamentId, captainId]);
        const team = teamRows[0];

        if (!team) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: 'Team not found or you are not the captain.' });
        }
        
        if (parseInt(team.member_count) < 6) { // MIN_TEAM_SIZE
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'Team needs at least 6 members to register.' });
        }
        
        // 2. Update team status to registered
        const updateSql = `UPDATE tournament_teams SET status = 'registered' WHERE id = $1`;
        
        await client.query(updateSql, [team.id]);
        
        await client.query("COMMIT");
        res.json({ 
            message: 'Team registered successfully!',
            teamId: team.id,
            teamName: team.team_name
        });
        
    } catch (err) {
        await client.query("ROLLBACK");
        console.error('Error confirming registration:', err);
        return res.status(500).json({ error: 'Failed to confirm registration' });
    } finally {
        client.release();
    }
});


// --- Team Building & Matchmaking Endpoints (Field Booking) ---

// Helper function to calculate players needed for matchmaking
function getPlayersNeededForMatchmaking(bookingType, currentPlayers) {
    switch (bookingType) {
        case 'team_vs_team':
            // Total 12 players (6v6). If a team has N, it needs (12 - N) total players for the pool.
            return 12 - currentPlayers; 
        case 'team_looking_for_players':
            // Max team size 5. If a team has N, it needs (5 - N) individual players.
            return 5 - currentPlayers; 
        case 'players_looking_for_team':
            // Single player needs 9 others for a 5v5 game (total 10 players)
            return 9; 
        default:
            return 0;
    }
}

// Initiate Team Building Session (Booking Option 1, 2, or 3)
app.post('/api/team-building/initiate', async (req, res) => {
    const { userId, fieldId, slotDate, startTime, endTime, bookingType } = req.body;
    
    if (!userId || !fieldId || !slotDate || !bookingType) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }
    
    const invitationCode = crypto.randomBytes(8).toString('hex');
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        
        // 1. Check if the slot is already reserved 
        // If a specific startTime is provided (two_teams_ready), ensure it isn't reserved.
        let slotRows = [];
        if (startTime) {
            const checkSlotSql = `
                SELECT id 
                FROM availability_slots 
                WHERE field_id = $1 AND slot_date = $2 AND start_time = $3 AND is_reserved = 1 
                FOR UPDATE NOWAIT
            `;
            const resCheck = await client.query(checkSlotSql, [fieldId, slotDate, startTime]);
            slotRows = resCheck.rows;
        }

        if (slotRows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: 'The selected time slot is already reserved.' });
        }

        // Determine initial team designation for the creator
        const teamDesignation = bookingType === 'two_teams_ready' ? 'A' : 'single';
        
        // 2. Create team building session
        const createSessionSql = `
            INSERT INTO team_sessions (
                invitation_code, creator_id, field_id, slot_date, start_time, end_time, booking_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `;
        
        const createResult = await client.query(createSessionSql, [
            invitationCode, 
            userId, 
            fieldId, 
            slotDate, 
            bookingType === 'two_teams_ready' ? startTime : null, 
            bookingType === 'two_teams_ready' ? endTime : null, 
            bookingType
        ]);
        const sessionId = createResult.rows[0].id;
        
        // 3. Add creator as first member
        const addMemberSql = `
            INSERT INTO team_members (session_id, user_id, team_designation)
            VALUES ($1, $2, $3)
        `;
        
        await client.query(addMemberSql, [sessionId, userId, teamDesignation]);
            
        await client.query("COMMIT");

        res.json({ invitationCode, sessionId });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error('Transaction error in /api/team-building/initiate:', err);
        return res.status(500).json({ error: 'Failed to create team session: ' + err.message });
    } finally {
        client.release();
    }
});

// Get Team Building Session Details
app.get('/api/team-building/:invitationCode', async (req, res) => {
    const { invitationCode } = req.params;
    
    try {
        // 1. Get session details
        const sessionSql = `
            SELECT ts.*, f.name as field_name, f.location as field_address, f.image as field_image, f.price_per_hour
            FROM team_sessions ts
            JOIN fields f ON ts.field_id = f.id
            WHERE ts.invitation_code = $1 AND ts.status = 'active'
        `;
        
        const { rows: sessionRows } = await pool.query(sessionSql, [invitationCode]);
        const session = sessionRows[0];

        if (!session) {
            return res.status(404).json({ error: 'Team session not found or inactive.' });
        }
        
        // 2. Get team members
        const membersSql = `
            SELECT tm.id, tm.session_id, tm.user_id, u.name as player_name, tm.team_designation
            FROM team_members tm
            JOIN users u ON tm.user_id = u.id
            WHERE tm.session_id = $1
            ORDER BY tm.joined_at
        `;
        
        const { rows: members } = await pool.query(membersSql, [session.id]);
        
        // Convert field image to base64 if it exists
        if (session.field_image) {
            session.field_image = Buffer.from(session.field_image).toString('base64');
        }
        
        res.json({ session, members });
    } catch (err) {
        console.error('Error fetching team building session:', err);
        return res.status(500).json({ error: 'Failed to fetch team building session.' });
    }
});

// Join Team Building Session
app.post('/api/team-building/join', async (req, res) => {
    const { invitationCode, userId, teamDesignation } = req.body;
    
    if (!invitationCode || !userId || !['A', 'B', 'single'].includes(teamDesignation)) {
        return res.status(400).json({ error: 'Missing or invalid required fields (invitationCode, userId, teamDesignation).' });
    }
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Get the session (FOR UPDATE lock)
        const sessionSql = `SELECT * FROM team_sessions WHERE invitation_code = $1 AND status = 'active' FOR UPDATE`;
        const { rows: sessionRows } = await client.query(sessionSql, [invitationCode]);
        const session = sessionRows[0];

        if (!session) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: 'Team session not found or inactive.' });
        }
        
        // 2. Check if user is already in this session
        const checkMemberSql = `SELECT id FROM team_members WHERE session_id = $1 AND user_id = $2`;
        const checkResult = await client.query(checkMemberSql, [session.id, userId]);
        
        if (checkResult.rowCount > 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'User already in this team session.' });
        }
        
        // 3. Check for team capacity limit (Option 3 only: team_looking_for_players max 5)
        if (session.booking_type === 'team_looking_for_players') {
            const countSql = `SELECT COUNT(*) as current_count FROM team_members WHERE session_id = $1 AND team_designation = 'single'`;
            const countResult = await client.query(countSql, [session.id]);
            const currentCount = parseInt(countResult.rows[0].current_count);
            
            if (currentCount >= 5) {
                await client.query("ROLLBACK");
                return res.status(400).json({ error: 'Team is full (max 5 players).' });
            }
        } 

        // 4. Add member
        const addMemberSql = `
            INSERT INTO team_members (session_id, user_id, team_designation)
            VALUES ($1, $2, $3)
        `;
        
        await client.query(addMemberSql, [session.id, userId, teamDesignation]);

        await client.query("COMMIT");
        res.json({ message: 'Successfully joined team.' });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error('Transaction error joining team:', err);
        return res.status(500).json({ error: 'Failed to join team.' });
    } finally {
        client.release();
    }
});

// Remove Player from Team Building Session
app.post('/api/team-building/remove-player', async (req, res) => {
    const { invitationCode, userId, targetUserId } = req.body;
    
    if (!invitationCode || !userId || !targetUserId) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        
        // 1. Get session and verify user is creator (FOR UPDATE lock)
        const sessionSql = `SELECT * FROM team_sessions WHERE invitationCode = $1 AND creator_id = $2 AND status = 'active' FOR UPDATE`;
        const { rows: sessionRows } = await client.query(sessionSql, [invitationCode, userId]);
        const session = sessionRows[0];

        if (!session) {
            await client.query("ROLLBACK");
            return res.status(403).json({ error: 'Unauthorized or session not found.' });
        }
        
        // Prevent creator from removing themselves
        if (parseInt(targetUserId) === parseInt(userId)) {
             await client.query("ROLLBACK");
             return res.status(400).json({ error: 'Cannot remove the team creator.' });
        }
        
        // 2. Remove the target user
        const removeSql = `DELETE FROM team_members WHERE session_id = $1 AND user_id = $2`;
        
        const removeResult = await client.query(removeSql, [session.id, targetUserId]);
        
        if (removeResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: 'Player not found in this session.' });
        }
        
        await client.query("COMMIT");
        res.json({ message: 'Player removed successfully.' });
        
    } catch (err) {
        await client.query("ROLLBACK");
        console.error('Transaction error removing player:', err);
        return res.status(500).json({ error: 'Failed to remove player.' });
    } finally {
        client.release();
    }
});

// Option 1: Confirm Booking (Two Teams Ready)
app.post('/api/team-building/confirm-booking', async (req, res) => {
    const { invitationCode, userId } = req.body;
    
    if (!invitationCode || !userId) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        
        // 1. Get session, verify user is creator, and check booking type (FOR UPDATE lock)
        const sessionSql = `
            SELECT * FROM team_sessions 
            WHERE invitation_code = $1 AND creator_id = $2 AND status = 'active' AND booking_type = 'two_teams_ready'
            FOR UPDATE
        `;
        
        const { rows: sessionRows } = await client.query(sessionSql, [invitationCode, userId]);
        const session = sessionRows[0];

        if (!session) {
            await client.query("ROLLBACK");
            return res.status(403).json({ error: 'Unauthorized, session not found, or booking type mismatch.' });
        }
        
        // 2. Check player counts
        const countSql = `SELECT team_designation, COUNT(*) as count FROM team_members WHERE session_id = $1 GROUP BY team_designation`;
        const { rows: countResults } = await client.query(countSql, [session.id]);
        
        const teamA = countResults.find(r => r.team_designation === 'A')?.count || 0;
        const teamB = countResults.find(r => r.team_designation === 'B')?.count || 0;
        
        if (teamA < 6 || teamB < 6) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'Reservation failed: Both teams must have at least 6 players (6v6 minimum).' });
        }

        // 3. Create availability slot reservation
        const reserveSql = `
            UPDATE availability_slots 
            SET is_reserved = 1, reservation_type = $1, user_id = $2 
            WHERE field_id = $3 AND slot_date = $4 AND start_time = $5 AND is_reserved = 0
        `;
        
        const reserveResult = await client.query(reserveSql, [
            'two_teams_ready', 
            userId, 
            session.field_id, 
            session.slot_date, 
            session.start_time
        ]);
        
        if (reserveResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ error: 'Failed to reserve the slot. It may already be taken.' });
        }
        
        // 4. Insert into reservations table (confirmed booking)
        const insertReservationSql = `
            INSERT INTO reservations (user_id, field_id, slot_date, start_time, end_time, booking_type, session_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `;
        const insertReservationRes = await client.query(insertReservationSql, [
            userId,
            session.field_id,
            session.slot_date,
            session.start_time,
            session.end_time,
            'two_teams_ready',
            session.id
        ]);

        // 5. Update session status
        const updateSessionSql = `UPDATE team_sessions SET status = 'completed' WHERE id = $1`;
        await client.query(updateSessionSql, [session.id]);
        
        await client.query("COMMIT");
        res.json({ message: 'Booking confirmed successfully!', reservationId: insertReservationRes.rows[0].id });
        
    } catch (err) {
        await client.query("ROLLBACK");
        console.error('Transaction error confirming booking:', err);
        return res.status(500).json({ error: 'Failed to complete booking: ' + err.message });
    } finally {
        client.release();
    }
});

// Option 2 & 3: Submit Matchmaking Request
app.post('/api/team-building/submit-matchmaking', async (req, res) => {
    const { invitationCode, userId, currentPlayers } = req.body;
    
    if (!invitationCode || !userId || typeof currentPlayers !== 'number') {
        return res.status(400).json({ error: 'Missing required fields or invalid player count.' });
    }
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Get session and verify user is creator (FOR UPDATE lock)
        const sessionSql = `
            SELECT * FROM team_sessions 
            WHERE invitation_code = $1 AND creator_id = $2 AND status = 'active' 
            AND booking_type IN ('team_vs_team', 'team_looking_for_players')
            FOR UPDATE
        `;
        
        const { rows: sessionRows } = await client.query(sessionSql, [invitationCode, userId]);
        const session = sessionRows[0];

        if (!session) {
            await client.query("ROLLBACK");
            return res.status(403).json({ error: 'Unauthorized, session not found, or booking type mismatch.' });
        }
        
        const bookingType = session.booking_type;
        const requiredMin = bookingType === 'team_vs_team' ? 6 : 3;

        if (currentPlayers < requiredMin) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: `Matchmaking failed: Team must have at least ${requiredMin} players.` });
        }

        // 2. Calculate players needed for the *matchmaking pool*
        const playersNeededForPool = getPlayersNeededForMatchmaking(bookingType, currentPlayers);

        // 3. Create matchmaking request
        const matchmakingSql = `
            INSERT INTO matchmaking_requests (user_id, field_id, slot_date, start_time, end_time, request_type, players_needed)
            VALUES ($1, $2, $3, NULL, NULL, $4, $5)
            RETURNING id
        `;
        
        await client.query(matchmakingSql, [
            userId, 
            session.field_id, 
            session.slot_date, 
            bookingType, 
            playersNeededForPool
        ]);
        
        // 4. Update session status
        const updateSessionSql = `UPDATE team_sessions SET status = 'completed' WHERE id = $1`;
        await client.query(updateSessionSql, [session.id]);
        
        await client.query("COMMIT");
        res.json({ message: 'Matchmaking request submitted successfully!' });
        
    } catch (err) {
        await client.query("ROLLBACK");
        console.error('Transaction error submitting matchmaking request:', err);
        return res.status(500).json({ error: 'Failed to create matchmaking request: ' + err.message });
    } finally {
        client.release();
    }
});


// --- Other API Endpoints (Admin Matchmaking) ---
console.log('Registering admin matchmaking and tournament routes...');

app.get('/api/admin/matchmaking/suggestions', checkAdmin, async (req, res) => {
    const sql = `
        SELECT
            p.user_id AS player_id,
            player_user.name AS player_name,
            t.user_id AS team_id,
            team_user.name AS team_name,
            p.slot_date,
            -- time removed for day-only matching
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
            ON p.field_id = f.id
        WHERE p.request_type = 'players_looking_for_team'
            AND t.request_type = 'team_looking_for_players'
            AND p.status = 'pending'
            AND t.status = 'pending'
    `;
    try {
        const { rows } = await pool.query(sql);
        res.json({ suggestions: rows });
    } catch (err) {
        console.error('Error fetching matchmaking suggestions:', err);
        return res.status(500).json({ error: err.message });
    }
});

// Admin: Get categorized matchmaking requests and potential matches
app.get('/api/admin/matchmaking/categorized', checkAdmin, async (req, res) => {
    console.log('Hit /api/admin/matchmaking/categorized');
    try {
        // Fetch pending requests for each category
        const teamLookingSql = `
            SELECT mr.id, mr.user_id, u.name AS user_name, mr.field_id, f.name AS field_name,
                   mr.slot_date, mr.request_type, mr.status, mr.players_needed
            FROM matchmaking_requests mr
            JOIN users u ON mr.user_id = u.id
            JOIN fields f ON mr.field_id = f.id
            WHERE mr.request_type = 'team_looking_for_players'
        `;

        const teamVsTeamSql = `
            SELECT mr.id, mr.user_id, u.name AS user_name, mr.field_id, f.name AS field_name,
                   mr.slot_date, mr.request_type, mr.status, mr.players_needed
            FROM matchmaking_requests mr
            JOIN users u ON mr.user_id = u.id
            JOIN fields f ON mr.field_id = f.id
            WHERE mr.request_type = 'team_vs_team'
        `;

        const playersLookingSql = `
            SELECT mr.id, mr.user_id, u.name AS user_name, mr.field_id, f.name AS field_name,
                   mr.slot_date, mr.request_type, mr.status, mr.players_needed
            FROM matchmaking_requests mr
            JOIN users u ON mr.user_id = u.id
            JOIN fields f ON mr.field_id = f.id
            WHERE mr.request_type = 'players_looking_for_team'
        `;

        const [teamLookingRows, teamVsTeamRows, playersLookingRows] = await Promise.all([
            pool.query(teamLookingSql).then(r => r.rows),
            pool.query(teamVsTeamSql).then(r => r.rows),
            pool.query(playersLookingSql).then(r => r.rows),
        ]);

        // Build potential matches similar to suggestions but enriched for UI
        const suggestionsSql = `
            SELECT
                t.id AS team_request_id,
                t.user_id AS team_user_id,
                team_user.name AS team_user_name,
                team_user.phone_number AS team_phone_number,
                t.slot_date,
                f.name AS field_name,
                t.players_needed AS team_players_needed,

                p.id AS player_request_id,
                p.user_id AS player_user_id,
                player_user.name AS player_user_name
            FROM matchmaking_requests p
            INNER JOIN matchmaking_requests t
                ON p.slot_date = t.slot_date
                AND p.field_id = t.field_id
            INNER JOIN users AS player_user
                ON p.user_id = player_user.id
            INNER JOIN users AS team_user
                ON t.user_id = team_user.id
            INNER JOIN fields AS f
                ON p.field_id = f.id
            WHERE p.request_type = 'players_looking_for_team'
                AND t.request_type = 'team_looking_for_players'
                AND p.status = 'pending'
                AND t.status = 'pending'
        `;

        const suggestionsRows = await pool.query(suggestionsSql).then(r => r.rows);

        const potentialMatches = suggestionsRows.map(row => ({
            teamRequest: {
                id: row.team_request_id,
                user_id: row.team_user_id,
                user_name: row.team_user_name,
                phone_number: row.team_phone_number,
                slot_date: row.slot_date,
                field_name: row.field_name,
                players_needed: row.team_players_needed,
            },
            playerRequest: {
                id: row.player_request_id,
                user_id: row.player_user_id,
                user_name: row.player_user_name,
            }
        }));

        res.json({
            team_looking_for_players: teamLookingRows,
            team_vs_team: teamVsTeamRows,
            players_looking_for_team: playersLookingRows,
            potential_matches: potentialMatches,
        });
    } catch (err) {
        console.error('Error fetching categorized matchmaking:', err);
        return res.status(500).json({ error: 'Failed to fetch categorized matchmaking.' });
    }
});

// Admin: List all tournaments with field info
app.get('/api/admin/tournaments', checkAdmin, async (req, res) => {
    console.log('Hit /api/admin/tournaments');
    try {
        const sql = `
            SELECT t.id, t.name, t.tournament_date, t.prize, f.name AS field_name
            FROM tournaments t
            LEFT JOIN fields f ON t.field_id = f.id
            ORDER BY t.tournament_date DESC, t.id DESC
        `;
        const { rows } = await pool.query(sql);
        res.json({ tournaments: rows });
    } catch (err) {
        console.error('Error fetching admin tournaments:', err);
        return res.status(500).json({ error: 'Failed to fetch tournaments' });
    }
});

// Admin: Analytics overview
app.get('/api/admin/analytics', checkAdmin, async (req, res) => {
    try {
        console.log('Admin analytics requested');

        const [usersCountRes, reservationsCountRes, earningsRes, pendingRequestsRes, recentRes] = await Promise.all([
            pool.query("SELECT COUNT(*) AS count FROM users"),
            pool.query("SELECT COUNT(*) AS count FROM reservations"),
            pool.query(`
                SELECT COALESCE(SUM(f.price_per_hour), 0) AS total
                FROM reservations r
                JOIN fields f ON r.field_id = f.id
            `),
            pool.query("SELECT COUNT(*) AS count FROM matchmaking_requests WHERE status = 'pending'"),
            pool.query(`
                SELECT r.id, u.name AS user_name, f.name AS field_name, r.slot_date, r.start_time, f.price_per_hour
                FROM reservations r
                JOIN fields f ON r.field_id = f.id
                JOIN users u ON r.user_id = u.id
                ORDER BY r.slot_date DESC, r.start_time DESC
                LIMIT 5
            `)
        ]);

        const totalUsers = parseInt(usersCountRes.rows[0]?.count ?? '0', 10);
        const totalReservations = parseInt(reservationsCountRes.rows[0]?.count ?? '0', 10);
        const totalEarnings = Number(earningsRes.rows[0]?.total ?? 0);
        const pendingRequests = parseInt(pendingRequestsRes.rows[0]?.count ?? '0', 10);
        const recentReservations = recentRes.rows || [];

        res.json({
            totalUsers,
            totalReservations,
            totalEarnings,
            pendingRequests,
            recentReservations
        });
    } catch (err) {
        console.error('Error fetching admin analytics:', err);
        return res.status(500).json({ error: 'Failed to load analytics' });
    }
});

// Admin: Get tournament teams including status
app.get('/api/admin/tournaments/:tournamentId/teams', checkAdmin, async (req, res) => {
    console.log('Hit /api/admin/tournaments/:tournamentId/teams', req.params.tournamentId);
    const { tournamentId } = req.params;
    try {
        const tournamentSql = 'SELECT name FROM tournaments WHERE id = $1';
        const { rows: tournamentRows } = await pool.query(tournamentSql, [tournamentId]);
        const tournament = tournamentRows[0];
        if (!tournament) {
            return res.status(404).json({ success: false, message: 'البطولة غير موجودة' });
        }
        const teamsSql = `
            SELECT 
                tt.team_name,
                u.name AS captain_name,
                tt.registration_date,
                tt.status
            FROM tournament_teams tt
            JOIN users u ON tt.captain_id = u.id
            WHERE tt.tournament_id = $1
            ORDER BY tt.registration_date ASC
        `;
        const { rows: teams } = await pool.query(teamsSql, [tournamentId]);
        res.json({ success: true, tournament, teams: teams || [] });
    } catch (err) {
        console.error('Error fetching admin tournament teams:', err);
        return res.status(500).json({ success: false, message: 'خطأ في تحميل الفرق' });
    }
});

// Admin: Reject a matchmaking request
app.post('/api/admin/matchmaking-requests/:requestId/reject', checkAdmin, async (req, res) => {
    const { requestId } = req.params;
    try {
        const sql = `UPDATE matchmaking_requests SET status = 'rejected' WHERE id = $1`;
        const result = await pool.query(sql, [requestId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Request not found.' });
        }
        res.json({ message: 'Matchmaking request rejected successfully.' });
    } catch (err) {
        console.error('Error rejecting matchmaking request:', err);
        return res.status(500).json({ error: 'Failed to reject request.' });
    }
});

app.post('/api/admin/matchmaking-requests/:requestId/approve', checkAdmin, async (req, res) => {
    const { requestId } = req.params;
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Get the matchmaking request details (FOR UPDATE lock)
        const getRequestSql = `SELECT * FROM matchmaking_requests WHERE id = $1 FOR UPDATE`;
        const { rows: reqRows } = await client.query(getRequestSql, [requestId]);
        const request = reqRows[0];

        if (!request) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: 'Matchmaking request not found.' });
        }
        
        // 2. Find an available slot on the same day (day-only requests have NULL time)
        let checkSlotSql;
        let slotRows;
        if (request.start_time) {
            checkSlotSql = `
                SELECT id 
                FROM availability_slots 
                WHERE field_id = $1 AND slot_date = $2 AND start_time = $3 AND is_reserved = 0
                FOR UPDATE NOWAIT
            `;
            ({ rows: slotRows } = await client.query(checkSlotSql, [request.field_id, request.slot_date, request.start_time]));
        } else {
            checkSlotSql = `
                SELECT id, start_time, end_time 
                FROM availability_slots 
                WHERE field_id = $1 AND slot_date = $2 AND is_reserved = 0
                ORDER BY start_time ASC
                FOR UPDATE NOWAIT
            `;
            ({ rows: slotRows } = await client.query(checkSlotSql, [request.field_id, request.slot_date]));
        }
        const slot = slotRows[0];
        
        if (!slot) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: 'The corresponding slot is no longer available or already reserved.' });
        }

        // 3. Update the matchmaking request status to approved
        const updateRequestSql = `UPDATE matchmaking_requests SET status = 'approved' WHERE id = $1`;
        await client.query(updateRequestSql, [requestId]);
        
        // 4. Update the availability slot
        const updateSlotSql = `UPDATE availability_slots SET is_reserved = 1, reservation_type = $1, user_id = $2 WHERE id = $3`;
        await client.query(updateSlotSql, [request.request_type, request.user_id, slot.id]);
        
        await client.query("COMMIT");
        res.json({ message: 'Matchmaking request approved and slot reserved successfully!' });

    } catch (err) {
        await client.query("ROLLBACK");
        console.error('Transaction error approving matchmaking request:', err);
        return res.status(500).json({ error: 'Failed to approve request.' });
    } finally {
        client.release();
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
