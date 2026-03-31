import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const isProduction = process.env.NODE_ENV === 'production';
const sqlSlowMs = parseInt(process.env.SQL_SLOW_QUERY_MS || '300', 10);
const logSqlAll = process.env.LOG_SQL_ALL === 'true' && !isProduction;
const verboseDbLogs = process.env.LOG_DB_VERBOSE === 'true' && !isProduction;
let poolConnectCount = 0;

// Database connection configuration
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'raceflow_db',
  user: process.env.POSTGRES_USER || 'raceflow_user',
  password: process.env.POSTGRES_PASSWORD || 'raceflow_password',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Test database connection
pool.on('connect', () => {
  poolConnectCount += 1;
  if (poolConnectCount === 1) {
    console.log('✅ PostgreSQL pool initialized');
  } else if (verboseDbLogs) {
    console.log(`✅ PostgreSQL client connected (pool connection #${poolConnectCount})`);
  }
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

// Helper function to execute queries
export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (logSqlAll) {
      console.log('Executed query', { text, duration, rows: res.rowCount });
    } else if (duration >= sqlSlowMs) {
      console.warn('Slow query detected', { duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Query error', { duration: Date.now() - start, error });
    throw error;
  }
};

// Helper function to get a client from the pool
export const getClient = async () => {
  const client = await pool.connect();
  return client;
};

export default pool;





