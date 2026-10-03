import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 15000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});
pool.on('error', (err) => console.error('[DB] Erro:', err.message));
export async function query(text, params) { return pool.query(text, params); }
export async function warmup() {
  try {
    const t = Date.now();
    await pool.query('SELECT 1');
    console.log(`[DB] Warm-up OK (${Date.now() - t}ms)`);
  } catch (e) { console.warn('[DB] Warm-up falhou:', e.message); }
}
export default pool;
