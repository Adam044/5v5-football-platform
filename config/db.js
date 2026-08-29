const pool = require('../database');

/**
 * Initialize the database schema if tables don't exist.
 */
async function initSchema() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // USERS Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                phone_number TEXT,
                birthdate TEXT,
                gender TEXT,
                password TEXT NOT NULL,
                is_admin INTEGER DEFAULT 0,
                role TEXT DEFAULT 'player', -- 'player', 'coach', 'admin'
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // TRAINING_SUBSCRIPTIONS Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS training_subscriptions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                credits INTEGER DEFAULT 8,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                status TEXT DEFAULT 'active', -- 'active', 'expired', 'cancelled'
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // TRAINING_ATTENDANCE Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS training_attendance (
                id SERIAL PRIMARY KEY,
                subscription_id INTEGER REFERENCES training_subscriptions(id) ON DELETE CASCADE,
                coach_id INTEGER REFERENCES users(id),
                attended_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // FIELDS Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS fields (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                location TEXT,
                image_url TEXT,
                price_per_hour REAL
            );
        `);

        // AVAILABILITY_SLOTS Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS availability_slots (
                id SERIAL PRIMARY KEY,
                field_id INTEGER REFERENCES fields(id),
                slot_date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                is_reserved INTEGER DEFAULT 0,
                reservation_type TEXT,
                user_id INTEGER REFERENCES users(id),
                is_recurring BOOLEAN DEFAULT FALSE,
                rule_id INTEGER,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // AVAILABILITY_RULES Table (Master Recurring Patterns)
        await client.query(`
            CREATE TABLE IF NOT EXISTS availability_rules (
                id SERIAL PRIMARY KEY,
                field_id INTEGER REFERENCES fields(id) ON DELETE CASCADE,
                day_of_week INTEGER NOT NULL, -- 0-6 (Sun-Sat)
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // MATCHMAKING_REQUESTS Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS matchmaking_requests (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                field_id INTEGER REFERENCES fields(id),
                slot_date TEXT NOT NULL,
                start_time TEXT,
                end_time TEXT,
                request_type TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                players_needed INTEGER,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // TOURNAMENTS Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS tournaments (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                field_id INTEGER REFERENCES fields(id),
                tournament_date TEXT NOT NULL,
                prize TEXT,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // CATEGORIES Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // GALLERY_IMAGES Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS gallery_images (
                id SERIAL PRIMARY KEY,
                image_url TEXT NOT NULL,
                title TEXT,
                category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // SPONSORS Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS sponsors (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                image_url TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // GIVEAWAYS Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS giveaways (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                image_url TEXT,
                deadline TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // GIVEAWAY_PARTICIPANTS Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS giveaway_participants (
                id SERIAL PRIMARY KEY,
                giveaway_id INTEGER REFERENCES giveaways(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(giveaway_id, user_id)
            );
        `);

        // TEAM_SESSIONS Table (Matchmaking/Booking sessions)
        await client.query(`
            CREATE TABLE IF NOT EXISTS team_sessions (
                id SERIAL PRIMARY KEY,
                invitation_code TEXT UNIQUE NOT NULL,
                creator_id INTEGER REFERENCES users(id),
                field_id INTEGER REFERENCES fields(id),
                slot_date TEXT NOT NULL,
                start_time TEXT,
                end_time TEXT,
                booking_type TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // RESERVATIONS Table (Confirmed bookings)
        await client.query(`
            CREATE TABLE IF NOT EXISTS reservations (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                field_id INTEGER REFERENCES fields(id),
                slot_date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                booking_type TEXT NOT NULL,
                session_id INTEGER REFERENCES team_sessions(id),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // TEAM_MEMBERS Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS team_members (
                id SERIAL PRIMARY KEY,
                session_id INTEGER REFERENCES team_sessions(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                team_designation TEXT DEFAULT 'single',
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(session_id, user_id)
            );
        `);

        // TOURNAMENT_TEAMS Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS tournament_teams (
                id SERIAL PRIMARY KEY,
                tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
                team_name TEXT NOT NULL,
                captain_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                invitation_code TEXT UNIQUE NOT NULL,
                status TEXT DEFAULT 'forming',
                registration_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // TOURNAMENT_TEAM_MEMBERS Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS tournament_team_members (
                id SERIAL PRIMARY KEY,
                team_id INTEGER REFERENCES tournament_teams(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                user_name TEXT,
                is_captain INTEGER DEFAULT 0,
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(team_id, user_id)
            );
        `);

        // SYSTEM_SETTINGS Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // FIELD_RATINGS Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS field_ratings (
                id SERIAL PRIMARY KEY,
                field_id INTEGER REFERENCES fields(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                rating INTEGER CHECK (rating >= 1 AND rating <= 5),
                comment TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // FASHION_PRODUCTS Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS fashion_products (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                category TEXT NOT NULL,
                image_url TEXT,
                stock INTEGER DEFAULT 0,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // TRAINING_SCHEDULES Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS training_schedules (
                id SERIAL PRIMARY KEY,
                field_id INTEGER REFERENCES fields(id) ON DELETE CASCADE,
                day_of_week INTEGER, -- 0-6 (Sun-Sat)
                specific_date DATE, -- Optional: for one-off trainings
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // EMAIL_LOGS Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS email_logs (
                id SERIAL PRIMARY KEY,
                recipient_email TEXT NOT NULL,
                subject TEXT,
                content TEXT,
                application_id INTEGER, -- Optional: link to spain_camp_applications
                status TEXT, -- 'success', 'failed'
                error_message TEXT,
                sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // FIELD ADMIN SERVICE: fa_admins Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS fa_admins (
                id SERIAL PRIMARY KEY,
                field_id INTEGER REFERENCES fields(id) UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT NOT NULL,
                phone TEXT,
                price_per_hour REAL DEFAULT 100,
                default_slot_duration INTEGER DEFAULT 120,
                operating_start TEXT DEFAULT '08:00',
                operating_end TEXT DEFAULT '00:00',
                is_active INTEGER DEFAULT 1,
                password_changed_at TIMESTAMP WITH TIME ZONE,
                last_login TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // NOTE: fa_slots is deprecated in favor of dynamic virtual slots.
        // We keep the table for now to avoid breaking existing migrations,
        // but it is no longer used by the application logic.

        // FIELD ADMIN SERVICE: fa_bookings Table (isolated bookings from phone calls)
        await client.query(`
            CREATE TABLE IF NOT EXISTS fa_bookings (
                id SERIAL PRIMARY KEY,
                slot_id INTEGER, -- Legacy reference, can be NULL
                field_id INTEGER REFERENCES fields(id) NOT NULL,
                field_admin_id INTEGER REFERENCES fa_admins(id) NOT NULL,
                slot_date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                customer_name TEXT NOT NULL,
                customer_phone TEXT,
                amount REAL NOT NULL,
                payment_status TEXT NOT NULL DEFAULT 'unpaid',
                status TEXT NOT NULL DEFAULT 'confirmed',
                duration_minutes INTEGER NOT NULL,
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Concurrency Protection: Partial Unique Index to prevent double-booking same slot
        // Only active (confirmed) bookings are restricted.
        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_fa_bookings_no_overlap 
            ON fa_bookings (field_id, slot_date, start_time) 
            WHERE (status = 'confirmed');
        `);

        await client.query('COMMIT');
        console.log('Database schema initialized successfully.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error initializing database schema:', err);
    } finally {
        client.release();
    }
}

module.exports = { initSchema };
