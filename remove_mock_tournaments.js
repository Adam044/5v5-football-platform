const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to the database
const db = new sqlite3.Database(path.join(__dirname, '5v5.db'), (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
        return;
    }
    console.log('Connected to the SQLite database.');
});

// Check current tournaments
console.log('Current tournaments in database:');
db.all("SELECT * FROM tournaments", [], (err, rows) => {
    if (err) {
        console.error('Error fetching tournaments:', err.message);
        return;
    }
    
    if (rows.length === 0) {
        console.log('No tournaments found in database.');
        db.close();
        return;
    }
    
    console.log(`Found ${rows.length} tournament(s):`);
    rows.forEach((row, index) => {
        console.log(`${index + 1}. ID: ${row.id}, Name: ${row.name}, Date: ${row.tournament_date}`);
    });
    
    // Remove all tournaments (assuming they are mock data)
    console.log('\nRemoving all tournaments...');
    db.run("DELETE FROM tournaments", [], function(err) {
        if (err) {
            console.error('Error deleting tournaments:', err.message);
            return;
        }
        console.log(`✅ Deleted ${this.changes} tournament(s)`);
        
        // Also remove any tournament teams
        db.run("DELETE FROM tournament_teams", [], function(err) {
            if (err) {
                console.error('Error deleting tournament teams:', err.message);
                return;
            }
            console.log(`✅ Deleted ${this.changes} tournament team(s)`);
            
            // Reset the auto-increment counter
            db.run("DELETE FROM sqlite_sequence WHERE name='tournaments'", [], function(err) {
                if (err) {
                    console.error('Error resetting sequence:', err.message);
                } else {
                    console.log('✅ Reset tournament ID sequence');
                }
                
                db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err.message);
                    } else {
                        console.log('Database connection closed.');
                    }
                });
            });
        });
    });
});