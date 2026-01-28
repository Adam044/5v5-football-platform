const pool = require('./database');

async function initOwnerDB() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS system_settings (
            key VARCHAR(255) PRIMARY KEY,
            value JSONB NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    try {
        await pool.query(createTableQuery);
        console.log("system_settings table created successfully.");
        
        // Insert default values if not exists
        const defaultGlobalLock = {
            is_locked: false,
            message: '',
            type: 'none'
        };

        const defaultPageLocks = {}; // { "page_name": { is_locked: true, message: "...", type: "..." } }

        await pool.query(`
            INSERT INTO system_settings (key, value)
            VALUES ($1, $2)
            ON CONFLICT (key) DO NOTHING;
        `, ['global_lock', JSON.stringify(defaultGlobalLock)]);

        await pool.query(`
            INSERT INTO system_settings (key, value)
            VALUES ($1, $2)
            ON CONFLICT (key) DO NOTHING;
        `, ['page_locks', JSON.stringify(defaultPageLocks)]);

        console.log("Default system settings initialized.");
    } catch (err) {
        console.error("Error initializing owner DB:", err);
    } finally {
        // We don't close the pool here because the script might be required by server.js or run independently
        // If run independently, we should exit.
        if (require.main === module) {
            process.exit();
        }
    }
}

if (require.main === module) {
    initOwnerDB();
}

module.exports = initOwnerDB;
