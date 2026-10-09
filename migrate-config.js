import 'dotenv/config';
import { query, default as pool } from './src/db.js';

const sql = `
CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor JSONB NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO configuracoes (chave, valor)
VALUES
  ('hero', '{"imagem_url": null, "imagem_public_id": null}'::jsonb),
  ('temas', '[
    {"id":"vermelho","nome":"Vermelho","primaria":"#dc2626","escura":"#7f1d1d","clara":"#fca5a5","rgb":"220,38,38"},
    {"id":"laranja","nome":"Laranja","primaria":"#f97316","escura":"#9a3412","clara":"#fdba74","rgb":"249,115,22"},
    {"id":"castanho","nome":"Castanho","primaria":"#a16207","escura":"#713f12","clara":"#fde047","rgb":"161,98,7"},
    {"id":"azul","nome":"Azul","primaria":"#2563eb","escura":"#1e3a8a","clara":"#93c5fd","rgb":"37,99,235"}
  ]'::jsonb)
ON CONFLICT (chave) DO NOTHING;
`;

async function main() {
  console.log('\n=== Migracao configuracoes ===\n');
  try {
    await query(sql);
    console.log('OK.\n');

    const { rows } = await query(`SELECT chave, atualizado_em FROM configuracoes`);
    rows.forEach(r => console.log('  -', r.chave));
    console.log('');
  } catch (e) {
    console.error('ERRO:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
