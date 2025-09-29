const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to the database
const dbPath = path.join(__dirname, '5v5.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        return;
    }
    console.log('Connected to the SQLite database.');
});

// Create tournaments table
const createTournamentsTable = `
    CREATE TABLE IF NOT EXISTS tournaments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        registration_deadline TEXT NOT NULL,
        max_teams INTEGER DEFAULT 16,
        entry_fee REAL DEFAULT 0,
        prize_pool REAL DEFAULT 0,
        status TEXT DEFAULT 'upcoming' CHECK(status IN ('upcoming', 'registration_open', 'registration_closed', 'ongoing', 'completed', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`;

// Create tournament_teams table
const createTournamentTeamsTable = `
    CREATE TABLE IF NOT EXISTS tournament_teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        team_name TEXT NOT NULL,
        captain_id INTEGER NOT NULL,
        session_id INTEGER NOT NULL,
        registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
        FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE,
        FOREIGN KEY (captain_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES team_sessions (id) ON DELETE CASCADE,
        UNIQUE(tournament_id, session_id)
    )
`;

// Insert sample tournaments
const insertSampleTournaments = `
    INSERT OR IGNORE INTO tournaments (id, name, description, start_date, end_date, registration_deadline, max_teams, entry_fee, prize_pool, status)
    VALUES 
    (1, 'بطولة الشتاء 2025', 'بطولة كرة القدم الشتوية للفرق الخماسية', '2025-02-15', '2025-02-28', '2025-02-10', 16, 100.00, 2000.00, 'registration_open'),
    (2, 'كأس الربيع', 'بطولة الربيع السنوية لكرة القدم', '2025-04-01', '2025-04-15', '2025-03-25', 12, 150.00, 3000.00, 'upcoming'),
    (3, 'بطولة الصيف الكبرى', 'البطولة الكبرى لفصل الصيف', '2025-07-01', '2025-07-20', '2025-06-25', 20, 200.00, 5000.00, 'upcoming')
`;

// Execute table creation
db.serialize(() => {
    console.log('Creating tournaments table...');
    db.run(createTournamentsTable, (err) => {
        if (err) {
            console.error('Error creating tournaments table:', err.message);
        } else {
            console.log('✅ Tournaments table created successfully');
        }
    });

    console.log('Creating tournament_teams table...');
    db.run(createTournamentTeamsTable, (err) => {
        if (err) {
            console.error('Error creating tournament_teams table:', err.message);
        } else {
            console.log('✅ Tournament_teams table created successfully');
        }
    });

    console.log('Inserting sample tournaments...');
    db.run(insertSampleTournaments, (err) => {
        if (err) {
            console.error('Error inserting sample tournaments:', err.message);
        } else {
            console.log('✅ Sample tournaments inserted successfully');
        }
    });

    // Close the database connection
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed.');
            console.log('\n🎉 Tournament tables setup complete!');
        }
    });
});