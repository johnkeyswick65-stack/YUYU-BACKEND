import 'dotenv/config';
import { query, default as pool } from './src/db.js';

const sql = `
CREATE TABLE IF NOT EXISTS likes (
  id BIGSERIAL PRIMARY KEY,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  navegador_id TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (evento_id, navegador_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_evento ON likes(evento_id);

CREATE TABLE IF NOT EXISTS comentarios (
  id BIGSERIAL PRIMARY KEY,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  autor_nome TEXT NOT NULL,
  texto TEXT NOT NULL,
  navegador_id TEXT,
  estado TEXT NOT NULL DEFAULT 'pendente',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aprovado_em TIMESTAMPTZ,
  aprovado_por INTEGER REFERENCES admins(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_comentarios_evento ON comentarios(evento_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_estado ON comentarios(estado);
`;

async function main() {
  console.log('\n=== Migracao social (likes + comentarios) ===\n');
  try {
    await query(sql);
    console.log('OK: tabelas criadas/verificadas.\n');

    const { rows } = await query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('likes', 'comentarios')
      ORDER BY table_name
    `);
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
