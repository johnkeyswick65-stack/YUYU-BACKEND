import 'dotenv/config';
import { query, default as pool } from './src/db.js';

const sql = `
CREATE TABLE IF NOT EXISTS acessos (
  id BIGSERIAL PRIMARY KEY,
  ip TEXT NOT NULL,
  metodo TEXT NOT NULL,
  rota TEXT NOT NULL,
  status INTEGER,
  user_agent TEXT,
  admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acessos_ip ON acessos(ip);
CREATE INDEX IF NOT EXISTS idx_acessos_criado ON acessos(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_acessos_rota ON acessos(rota);

CREATE TABLE IF NOT EXISTS bloqueios (
  id SERIAL PRIMARY KEY,
  ip TEXT UNIQUE NOT NULL,
  motivo TEXT,
  bloqueado_por INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bloqueios_ip ON bloqueios(ip);
`;

async function main() {
  console.log('\n=== Migracao acessos + bloqueios ===\n');
  try {
    await query(sql);
    console.log('OK: tabelas criadas/verificadas.\n');

    const { rows } = await query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('acessos', 'bloqueios')
      ORDER BY table_name
    `);
    console.log('Tabelas existentes:');
    rows.forEach(r => console.log('  -', r.table_name));
    console.log('');
  } catch (e) {
    console.error('ERRO:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
