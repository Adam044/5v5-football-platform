const { Pool } = require('pg');
require('dotenv').config();

// Get the connection string from the .env file
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("FATAL: DATABASE_URL not set in .env file. Server cannot connect to Supabase.");
    process.exit(1);
}

// Initialize PostgreSQL Pool with enhanced configuration for Supabase
const pool = new Pool({
    connectionString,
    // Supabase SSL configuration
    ssl: {
        rejectUnauthorized: false 
    },
    // Optimized connection pool settings for Supabase Session Pooler
    max: 10, // Reduced max connections for session pooler
    min: 2, // Minimum connections to maintain
    idleTimeoutMillis: 20000, // Close idle clients after 20 seconds
    connectionTimeoutMillis: 15000, // Increased timeout for better reliability
    acquireTimeoutMillis: 15000, // Time to wait for connection from pool
    // Query configuration
    query_timeout: 30000, // Query timeout in milliseconds
    statement_timeout: 30000, // Statement timeout
    // Connection retry settings
    max_lifetime: 600000, // 10 minutes max connection lifetime
});

// Enhanced connection retry logic
const connectWithRetry = async (retries = 3, delay = 2000) => {
    for (let i = 0; i < retries; i++) {
        try {
            const client = await pool.connect();
            console.log('Successfully connected to Supabase PostgreSQL!');
            client.release();
            return true;
        } catch (err) {
            console.error(`Connection attempt ${i + 1}/${retries} failed:`, err.message);
            
            if (i === retries - 1) {
                console.error('All connection attempts failed. Please check:');
                console.error('1. Your internet connection');
                console.error('2. DATABASE_URL in the .env file');
                console.error('3. Supabase service status');
                return false;
            }
            
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 1.5; // Exponential backoff
        }
    }
};

// Enhanced query method with retry logic
const queryWithRetry = async (text, params, retries = 2) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await pool.query(text, params);
        } catch (err) {
            console.error(`Query attempt ${i + 1}/${retries} failed:`, err.message);
            
            // Check if it's a connection-related error
            if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
                if (i === retries - 1) {
                    throw new Error(`Database connection failed after ${retries} attempts: ${err.message}`);
                }
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            } else {
                // Non-connection error, don't retry
                throw err;
            }
        }
    }
};

// Test initial connection
connectWithRetry();

// Export pool and query function
module.exports = pool;
module.exports.queryWithRetry = queryWithRetry;
