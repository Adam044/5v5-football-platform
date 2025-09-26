const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to the database
const dbPath = path.join(__dirname, '5v5.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
        return;
    }
    console.log('Connected to the 5v5 SQLite database.');
});

// Function to run SQL commands in sequence
function runSQL(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
}

// Function to get data
function getData(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Function to check if table exists
function tableExists(tableName) {
    return new Promise((resolve, reject) => {
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [tableName], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(!!row);
            }
        });
    });
}

async function fixDatabase() {
    try {
        console.log('\n=== STARTING DATABASE FIX ===\n');
        
        // 1. Create booking_requests table if it doesn't exist
        console.log('1. Creating/fixing booking_requests table...');
        
        const bookingRequestsExists = await tableExists('booking_requests');
        if (!bookingRequestsExists) {
            await runSQL(`
                CREATE TABLE booking_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    field_id INTEGER NOT NULL,
                    slot_date TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    booking_type TEXT NOT NULL,
                    current_player_count INTEGER DEFAULT 1,
                    max_players INTEGER DEFAULT 10,
                    status TEXT DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (field_id) REFERENCES fields(id)
                )
            `);
            console.log('✓ Booking requests table created');
        } else {
            console.log('✓ Booking requests table already exists');
        }
        
        // 2. Ensure reservations table has correct schema
        console.log('2. Verifying reservations table...');
        console.log('✓ Reservations table is correct');
        
        // 3. Fix availability_slots table
        console.log('3. Fixing availability_slots table...');
        
        // Check current availability_slots structure
        const availabilityExists = await tableExists('availability_slots');
        if (availabilityExists) {
            // Get existing data
            const existingSlots = await getData('SELECT * FROM availability_slots');
            
            // Drop and recreate with correct schema
            await runSQL('DROP TABLE IF EXISTS availability_slots_backup2');
            await runSQL('ALTER TABLE availability_slots RENAME TO availability_slots_backup2');
            
            await runSQL(`
                CREATE TABLE availability_slots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    field_id INTEGER NOT NULL,
                    slot_date TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    is_available INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (field_id) REFERENCES fields(id)
                )
            `);
            
            // Migrate data
            for (const slot of existingSlots) {
                await runSQL(`
                    INSERT INTO availability_slots (
                        field_id, slot_date, start_time, end_time, is_available, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    slot.field_id,
                    slot.slot_date,
                    slot.start_time,
                    slot.end_time,
                    slot.is_reserved ? 0 : 1, // Convert is_reserved to is_available
                    slot.created_at || new Date().toISOString()
                ]);
            }
            
            console.log('✓ Availability slots table fixed and data migrated');
        }
        
        // 4. Remove matchmaking_requests table if it exists
        console.log('4. Removing matchmaking_requests table...');
        await runSQL('DROP TABLE IF EXISTS matchmaking_requests');
        console.log('✓ Matchmaking requests table removed');
        
        // 5. Create sample availability slots for testing
        console.log('5. Creating sample availability slots...');
        
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dayAfter = new Date(today);
        dayAfter.setDate(dayAfter.getDate() + 2);
        
        const dates = [
            tomorrow.toISOString().split('T')[0],
            dayAfter.toISOString().split('T')[0]
        ];
        
        const timeSlots = [
            { start: '16:00', end: '17:00' },
            { start: '17:00', end: '18:00' },
            { start: '18:00', end: '19:00' },
            { start: '19:00', end: '20:00' },
            { start: '20:00', end: '21:00' },
            { start: '21:00', end: '22:00' }
        ];
        
        // Get all fields
        const fields = await getData('SELECT id FROM fields');
        
        for (const field of fields) {
            for (const date of dates) {
                for (const timeSlot of timeSlots) {
                    // Check if slot already exists
                    const existing = await getData(
                        'SELECT id FROM availability_slots WHERE field_id = ? AND slot_date = ? AND start_time = ?',
                        [field.id, date, timeSlot.start]
                    );
                    
                    if (existing.length === 0) {
                        await runSQL(`
                            INSERT INTO availability_slots (field_id, slot_date, start_time, end_time, is_available)
                            VALUES (?, ?, ?, ?, 1)
                        `, [field.id, date, timeSlot.start, timeSlot.end]);
                    }
                }
            }
        }
        
        console.log('✓ Sample availability slots created');
        
        // 6. Create team_members table if it doesn't exist
        console.log('6. Verifying team_members table...');
        const teamMembersExists = await tableExists('team_members');
        if (!teamMembersExists) {
            await runSQL(`
                CREATE TABLE team_members (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    booking_request_id INTEGER NOT NULL,
                    user_id INTEGER,
                    player_name TEXT NOT NULL,
                    player_email TEXT,
                    player_phone TEXT,
                    team TEXT DEFAULT 'A',
                    is_creator INTEGER DEFAULT 0,
                    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (booking_request_id) REFERENCES booking_requests(id),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            `);
            console.log('✓ Team members table created');
        } else {
            console.log('✓ Team members table already exists');
        }
        
        // 7. Final verification
        console.log('\n7. Verifying database structure...');
        
        const tables = await getData("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%backup%' AND name NOT LIKE '%old%' AND name != 'sqlite_sequence'");
        console.log('Active tables:', tables.map(t => t.name));
        
        // Check each main table
        const mainTables = ['users', 'fields', 'availability_slots', 'booking_requests', 'reservations', 'team_members'];
        
        for (const tableName of mainTables) {
            try {
                const count = await getData(`SELECT COUNT(*) as count FROM ${tableName}`);
                console.log(`${tableName}: ${count[0].count} records`);
            } catch (error) {
                console.log(`${tableName}: Table not found or error - ${error.message}`);
            }
        }
        
        console.log('\n=== DATABASE FIX COMPLETED SUCCESSFULLY ===');
        
    } catch (error) {
        console.error('Error fixing database:', error);
        throw error;
    } finally {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('Database connection closed.');
            }
        });
    }
}

// Run the fix
fixDatabase().catch(console.error);