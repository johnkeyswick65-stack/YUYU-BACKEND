import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { gerarToken, requireAuth } from '../auth.js';

const router = express.Router();

/* POST /api/auth/login */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Username e password obrigatórios' });
    }

    const { rows } = await query(
      'SELECT id, username, password_hash, role, ativo FROM admins WHERE username = $1',
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Credenciais inválidas' });
    }

    const admin = rows[0];

    if (!admin.ativo) {
      return res.status(403).json({ ok: false, error: 'Conta desativada' });
    }

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) {
      return res.status(401).json({ ok: false, error: 'Credenciais inválidas' });
    }

    const token = gerarToken(admin);

    res.json({
      ok: true,
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        role: admin.role
      }
    });
  } catch (e) {
    console.error('[auth/login]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* GET /api/auth/me — confirma se o token é válido */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, username, role, ativo, criado_em FROM admins WHERE id = $1',
      [req.admin.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Admin não encontrado' });
    }

    res.json({ ok: true, admin: rows[0] });
  } catch (e) {
    console.error('[auth/me]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* POST /api/auth/change-password */
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { atual, nova } = req.body || {};

    if (!atual || !nova) {
      return res.status(400).json({ ok: false, error: 'Password atual e nova obrigatórias' });
    }

    if (nova.length < 6) {
      return res.status(400).json({ ok: false, error: 'A nova password deve ter pelo menos 6 caracteres' });
    }

    const { rows } = await query('SELECT password_hash FROM admins WHERE id = $1', [req.admin.id]);
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Admin não encontrado' });
    }

    const ok = await bcrypt.compare(atual, rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({ ok: false, error: 'Password atual incorreta' });
    }

    const hash = await bcrypt.hash(nova, 10);
    await query('UPDATE admins SET password_hash = $1 WHERE id = $2', [hash, req.admin.id]);

    res.json({ ok: true, message: 'Password alterada' });
  } catch (e) {
    console.error('[auth/change-password]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

export default router;
