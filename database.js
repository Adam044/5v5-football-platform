const { Pool } = require('pg');
require('dotenv').config();

// Get the connection string from the .env file
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("FATAL: DATABASE_URL not set in .env file. Server cannot connect to Supabase.");
    process.exit(1);
}

// Initialize PostgreSQL Pool
const pool = new Pool({
    connectionString,
    // Supabase often requires SSL configuration for secure connections
    ssl: {
        rejectUnauthorized: false 
    }
});

// Test connection and export
pool.connect()
    .then(client => {
        console.log('Successfully connected to Supabase PostgreSQL!');
        client.release();
    })
    .catch(err => {
        console.error('Connection error to Supabase PostgreSQL:', err.message);
        console.error('Please check your DATABASE_URL in the .env file.');
    });

module.exports = pool;
