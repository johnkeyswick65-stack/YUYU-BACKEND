import 'dotenv/config';
import readline from 'node:readline';
import bcrypt from 'bcryptjs';
import { query, default as pool } from '../src/db.js';

function perguntar(pergunta, oculto = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    if (oculto) {
      const stdin = process.stdin;
      process.stdout.write(pergunta);
      stdin.resume();
      stdin.setRawMode?.(true);
      let senha = '';
      const onData = (ch) => {
        const c = ch.toString('utf8');
        if (c === '\n' || c === '\r' || c === '\u0004') {
          stdin.setRawMode?.(false);
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(senha);
        } else if (c === '\u0003') {
          process.exit(1);
        } else if (c === '\u007f') {
          senha = senha.slice(0, -1);
        } else {
          senha += c;
          process.stdout.write('*');
        }
      };
      stdin.on('data', onData);
    } else {
      rl.question(pergunta, (resp) => {
        rl.close();
        resolve(resp);
      });
    }
  });
}

async function main() {
  console.log('\n=== Criar admin ===\n');

  const username = (await perguntar('Username: ')).trim();
  if (!username) {
    console.error('Username vazio.');
    process.exit(1);
  }

  const senha = await perguntar('Password: ', true);
  if (!senha || senha.length < 6) {
    console.error('Password tem de ter pelo menos 6 caracteres.');
    process.exit(1);
  }

  const confirma = await perguntar('Confirma a password: ', true);
  if (senha !== confirma) {
    console.error('As passwords não coincidem.');
    process.exit(1);
  }

  const existe = await query('SELECT id FROM admins WHERE username = $1', [username]);
  if (existe.rowCount > 0) {
    console.error('Já existe um admin com esse username.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(senha, 10);

  const { rows } = await query(
    'INSERT INTO admins (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role',
    [username, hash, 'admin']
  );

  console.log('\n✓ Admin criado:');
  console.log('  id:', rows[0].id);
  console.log('  username:', rows[0].username);
  console.log('  role:', rows[0].role);
  console.log('');

  await pool.end();
}

main().catch((e) => {
  console.error('Erro:', e.message);
  process.exit(1);
});
