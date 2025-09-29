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

// Insert sample tournaments using existing structure
const insertSampleTournaments = `
    INSERT OR IGNORE INTO tournaments (id, name, field_id, tournament_date, prize, description)
    VALUES 
    (1, 'بطولة الشتاء 2025', 1, '2025-02-15', '2000 ريال', 'بطولة كرة القدم الشتوية للفرق الخماسية - التسجيل مفتوح'),
    (2, 'كأس الربيع', 2, '2025-04-01', '3000 ريال', 'بطولة الربيع السنوية لكرة القدم - قريباً'),
    (3, 'بطولة الصيف الكبرى', 1, '2025-07-01', '5000 ريال', 'البطولة الكبرى لفصل الصيف - قريباً')
`;

// Execute insertion
db.serialize(() => {
    console.log('Inserting sample tournaments...');
    db.run(insertSampleTournaments, (err) => {
        if (err) {
            console.error('Error inserting sample tournaments:', err.message);
        } else {
            console.log('✅ Sample tournaments inserted successfully');
        }
    });

    // Check what was inserted
    db.all("SELECT * FROM tournaments", (err, rows) => {
        if (err) {
            console.error('Error fetching tournaments:', err.message);
        } else {
            console.log('\nCurrent tournaments:');
            rows.forEach(row => {
                console.log(`  - ${row.name} (${row.tournament_date}) - ${row.prize}`);
            });
        }
        
        // Close the database connection
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('\nDatabase connection closed.');
                console.log('🎉 Sample tournaments setup complete!');
            }
        });
    });
});