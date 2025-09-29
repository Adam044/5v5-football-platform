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

// Check if tournaments table exists and get its schema
db.serialize(() => {
    console.log('Checking tournaments table...');
    
    // Get table info
    db.all("PRAGMA table_info(tournaments)", (err, rows) => {
        if (err) {
            console.error('Error getting table info:', err.message);
        } else if (rows.length === 0) {
            console.log('❌ Tournaments table does not exist');
        } else {
            console.log('✅ Tournaments table exists with columns:');
            rows.forEach(row => {
                console.log(`  - ${row.name} (${row.type})`);
            });
        }
    });

    // Check tournament_teams table
    db.all("PRAGMA table_info(tournament_teams)", (err, rows) => {
        if (err) {
            console.error('Error getting tournament_teams table info:', err.message);
        } else if (rows.length === 0) {
            console.log('❌ Tournament_teams table does not exist');
        } else {
            console.log('✅ Tournament_teams table exists with columns:');
            rows.forEach(row => {
                console.log(`  - ${row.name} (${row.type})`);
            });
        }
    });

    // List all tables
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
        if (err) {
            console.error('Error listing tables:', err.message);
        } else {
            console.log('\nAll tables in database:');
            rows.forEach(row => {
                console.log(`  - ${row.name}`);
            });
        }
        
        // Close the database connection
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('\nDatabase connection closed.');
            }
        });
    });
});