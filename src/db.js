import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool:', err.message);
});

export async function query(text, params) {
  const inicio = Date.now();
  const res = await pool.query(text, params);
  const duracao = Date.now() - inicio;
  if (duracao > 500) {
    console.warn(`[DB] Query lenta (${duracao}ms):`, text.slice(0, 80));
  }
  return res;
}

export default pool;
