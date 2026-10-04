import 'dotenv/config';
import { query, default as pool } from './src/db.js';

const sql = `
ALTER TABLE eventos
  ADD COLUMN IF NOT EXISTS empresa_nome TEXT,
  ADD COLUMN IF NOT EXISTS empresa_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS empresa_logo_public_id TEXT,
  ADD COLUMN IF NOT EXISTS foto1_url TEXT,
  ADD COLUMN IF NOT EXISTS foto1_public_id TEXT,
  ADD COLUMN IF NOT EXISTS foto1_descricao TEXT,
  ADD COLUMN IF NOT EXISTS foto2_url TEXT,
  ADD COLUMN IF NOT EXISTS foto2_public_id TEXT,
  ADD COLUMN IF NOT EXISTS foto2_descricao TEXT;
`;

async function main() {
  console.log('\n=== Migracao Fase B ===\n');
  try {
    await query(sql);
    console.log('OK: colunas adicionadas/verificadas.\n');

    const { rows } = await query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'eventos'
        AND column_name LIKE 'empresa_%' OR column_name LIKE 'foto%'
      ORDER BY column_name
    `);
    console.log('Colunas novas:');
    rows.forEach(r => console.log('  -', r.column_name));
    console.log('');
  } catch (e) {
    console.error('ERRO:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
