import 'dotenv/config';
import { query, default as pool } from './src/db.js';

const schema = `

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eventos (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  descricao TEXT,
  data_evento TIMESTAMPTZ NOT NULL,
  local TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'outros',
  poster_url TEXT,
  poster_public_id TEXT,
  preco_normal INTEGER NOT NULL DEFAULT 0,
  preco_vip INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bilhetes (
  id SERIAL PRIMARY KEY,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  codigo TEXT UNIQUE NOT NULL,
  comprador_nome TEXT,
  comprador_telefone TEXT,
  tipo TEXT NOT NULL DEFAULT 'normal',
  preco INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendente',
  usado_em TIMESTAMPTZ,
  usado_por_admin_id INTEGER REFERENCES admins(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bilhetes_evento ON bilhetes(evento_id);
CREATE INDEX IF NOT EXISTS idx_bilhetes_codigo ON bilhetes(codigo);
CREATE INDEX IF NOT EXISTS idx_bilhetes_estado ON bilhetes(estado);

CREATE TABLE IF NOT EXISTS compras (
  id SERIAL PRIMARY KEY,
  bilhete_id INTEGER NOT NULL REFERENCES bilhetes(id) ON DELETE CASCADE,
  valor INTEGER NOT NULL,
  metodo TEXT NOT NULL,
  referencia TEXT,
  comprovativo_url TEXT,
  estado TEXT NOT NULL DEFAULT 'aguardando',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compras_bilhete ON compras(bilhete_id);
CREATE INDEX IF NOT EXISTS idx_compras_estado ON compras(estado);

CREATE TABLE IF NOT EXISTS validacoes (
  id SERIAL PRIMARY KEY,
  bilhete_id INTEGER REFERENCES bilhetes(id) ON DELETE SET NULL,
  admin_id INTEGER REFERENCES admins(id),
  resultado TEXT NOT NULL,
  notas TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validacoes_bilhete ON validacoes(bilhete_id);
`;

async function migrar() {
  console.log('\n=== Migração ===\n');
  try {
    await query(schema);
    console.log('✓ Tabelas criadas/verificadas');

    const { rows } = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('\nTabelas na base de dados:');
    rows.forEach(r => console.log('  ·', r.table_name));
    console.log('');
  } catch (e) {
    console.error('✗ Erro na migração:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrar();
