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

// Function to get table schema
function getTableSchema(tableName) {
    return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Function to get all tables
function getAllTables() {
    return new Promise((resolve, reject) => {
        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows.map(row => row.name));
            }
        });
    });
}

// Function to get sample data from a table
function getSampleData(tableName, limit = 5) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM ${tableName} LIMIT ${limit}`, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Function to get row count
function getRowCount(tableName) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row.count);
            }
        });
    });
}

// Main function to analyze the database
async function analyzeDatabase() {
    try {
        console.log('\n=== DATABASE ANALYSIS ===\n');
        
        // Get all tables
        const tables = await getAllTables();
        console.log('Tables found:', tables);
        
        // Analyze each table
        for (const tableName of tables) {
            console.log(`\n--- TABLE: ${tableName} ---`);
            
            // Get schema
            const schema = await getTableSchema(tableName);
            console.log('Schema:');
            schema.forEach(col => {
                console.log(`  ${col.name} (${col.type}) - ${col.notnull ? 'NOT NULL' : 'NULL'} - ${col.pk ? 'PRIMARY KEY' : ''} - Default: ${col.dflt_value || 'None'}`);
            });
            
            // Get row count
            const count = await getRowCount(tableName);
            console.log(`Row count: ${count}`);
            
            // Get sample data if table has data
            if (count > 0) {
                const sampleData = await getSampleData(tableName);
                console.log('Sample data:');
                console.table(sampleData);
            }
        }
        
        console.log('\n=== ANALYSIS COMPLETE ===');
        
    } catch (error) {
        console.error('Error analyzing database:', error);
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

// Run the analysis
analyzeDatabase();