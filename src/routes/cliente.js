import express from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const router = express.Router();

/* Normaliza telefone: remove espaços, traços, parênteses e prefixo +258 */
function normalizarTelefone(t) {
  if (!t) return '';
  let s = String(t).replace(/[\s\-\(\)\.]/g, '');
  s = s.replace(/^\+?258/, '');
  return s;
}

/* Normaliza nome: minúsculas, sem acentos, trim, espaços simples */
function normalizarNome(n) {
  if (!n) return '';
  return String(n)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/* Gera um JWT de cliente (separado do admin) */
function gerarTokenCliente(telefone) {
  return jwt.sign(
    { tipo: 'cliente', telefone },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

/* Middleware específico para clientes */
function requireCliente(req, res, next) {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');
  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ ok: false, error: 'Sessão em falta' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.tipo !== 'cliente') {
      return res.status(401).json({ ok: false, error: 'Token inválido' });
    }
    req.cliente = payload;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Sessão expirada' });
  }
}

/* ============================================================
   POST /api/cliente/login
   Body: { codigo, telefone, nome }
   - codigo: YUYU-XXXXX-XXXXX
   - telefone: tem de bater com o guardado no bilhete (normalizado)
   - nome: tem de bater com o comprador_nome (normalizado)
   Retorna JWT cliente + lista de bilhetes associados ao telefone
   ============================================================ */
router.post('/login', async (req, res) => {
  try {
    const codigo = String(req.body?.codigo || '').trim().toUpperCase();
    const telefone = normalizarTelefone(req.body?.telefone);
    const nome = normalizarNome(req.body?.nome);

    if (!codigo || !telefone || !nome) {
      return res.status(400).json({ ok: false, error: 'Preenche todos os campos.' });
    }

    // Busca o bilhete pelo código
    const { rows } = await query(
      `SELECT id, codigo, comprador_nome, comprador_telefone, evento_id
       FROM bilhetes WHERE codigo = $1`,
      [codigo]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, error: 'Bilhete não encontrado.' });
    }

    const b = rows[0];

    if (!b.comprador_telefone || !b.comprador_nome) {
      return res.status(400).json({
        ok: false,
        error: 'Este bilhete não tem dados de titular. Contacta o suporte.'
      });
    }

    const telBD = normalizarTelefone(b.comprador_telefone);
    const nomeBD = normalizarNome(b.comprador_nome);

    if (telBD !== telefone) {
      return res.status(401).json({ ok: false, error: 'Telefone não confere.' });
    }
    if (nomeBD !== nome) {
      return res.status(401).json({ ok: false, error: 'Nome não confere.' });
    }

    // Sucesso — gera token
    const token = gerarTokenCliente(telBD);

    res.json({
      ok: true,
      token,
      telefone: telBD,
      nome: b.comprador_nome
    });
  } catch (e) {
    console.error('[cliente/login]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* ============================================================
   GET /api/cliente/bilhetes
   Devolve todos os bilhetes com o telefone do token
   ============================================================ */
router.get('/bilhetes', requireCliente, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
        b.id, b.codigo, b.tipo, b.preco, b.estado, b.usado_em,
        b.comprador_nome, b.comprador_telefone, b.criado_em,
        e.id AS evento_id, e.nome AS evento_nome, e.slug AS evento_slug,
        e.data_evento, e.local, e.categoria, e.poster_url
       FROM bilhetes b
       JOIN eventos e ON e.id = b.evento_id
       WHERE REGEXP_REPLACE(COALESCE(b.comprador_telefone,''), '[^0-9]', '', 'g')
             LIKE '%' || $1
       ORDER BY e.data_evento DESC, b.criado_em DESC`,
      [req.cliente.telefone]
    );

    res.json({
      ok: true,
      telefone: req.cliente.telefone,
      total: rows.length,
      bilhetes: rows
    });
  } catch (e) {
    console.error('[cliente/bilhetes]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* ============================================================
   GET /api/cliente/me
   Confirma sessão
   ============================================================ */
router.get('/me', requireCliente, (req, res) => {
  res.json({ ok: true, telefone: req.cliente.telefone });
});


/* ============================================================
   PATCH /api/cliente/bilhetes/:id/upgrade
   Cliente sobe o proprio bilhete Normal -> VIP.
   Regra: nunca desce. So permite se for Normal + Ativo + nao usado.
   ============================================================ */
router.patch('/bilhetes/:id/upgrade', requireCliente, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ ok: false, error: 'ID inválido' });
    }

    const { rows } = await query(
      `SELECT b.id, b.tipo, b.estado, b.usado_em, b.comprador_telefone,
              e.preco_vip
       FROM bilhetes b
       JOIN eventos e ON e.id = b.evento_id
       WHERE b.id = $1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'Bilhete não encontrado' });
    }

    const b = rows[0];

    // Confirma que o bilhete e do telefone que está autenticado
    const telBD = normalizarTelefone(b.comprador_telefone);
    if (telBD !== req.cliente.telefone) {
      return res.status(403).json({ ok: false, error: 'Este bilhete não é seu.' });
    }

    if (b.tipo === 'vip') {
      return res.status(400).json({ ok: false, error: 'O bilhete já é VIP.' });
    }

    if (b.estado !== 'ativo') {
      return res.status(400).json({ ok: false, error: 'Só bilhetes ativos podem subir para VIP.' });
    }

    if (b.usado_em) {
      return res.status(400).json({ ok: false, error: 'Bilhete já foi usado.' });
    }

    const update = await query(
      `UPDATE bilhetes SET tipo = 'vip', preco = $1 WHERE id = $2 RETURNING *`,
      [b.preco_vip, id]
    );

    res.json({
      ok: true,
      message: 'Bilhete promovido a VIP',
      bilhete: update.rows[0]
    });
  } catch (e) {
    console.error('[cliente/upgrade]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

export default router;
