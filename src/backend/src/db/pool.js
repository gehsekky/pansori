import pg from 'pg';
const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (err) => console.error('Unexpected pool error', err));
