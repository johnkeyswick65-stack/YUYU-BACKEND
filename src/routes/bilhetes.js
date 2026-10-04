import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { gerarCodigoBilhete } from '../utils/codigo.js';
import { gerarQRBuffer, gerarBarcodeBuffer } from '../utils/codigos-visuais.js';
import { gerarBilhetePDF } from '../utils/bilhete-pdf.js';

const router = express.Router();

/* ============================================================
   POST /api/bilhetes — criar bilhete (admin)
   Body: { evento_id, comprador_nome, comprador_telefone, tipo }
   tipo: 'normal' | 'vip'
   ============================================================ */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { evento_id, comprador_nome, comprador_telefone, tipo } = req.body || {};

    if (!evento_id) {
      return res.status(400).json({ ok: false, error: 'evento_id é obrigatório' });
    }

    const tipoFinal = tipo === 'vip' ? 'vip' : 'normal';

    // Busca o evento para saber o preço
    const evento = await query(
      'SELECT id, preco_normal, preco_vip, ativo FROM eventos WHERE id = $1',
      [evento_id]
    );

    if (evento.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Evento não encontrado' });
    }
    if (!evento.rows[0].ativo) {
      return res.status(400).json({ ok: false, error: 'Evento está inativo' });
    }

    const preco = tipoFinal === 'vip'
      ? evento.rows[0].preco_vip
      : evento.rows[0].preco_normal;

    // Gera código único (retry em caso de colisão)
    let codigo;
    let tentativas = 0;
    while (tentativas < 5) {
      codigo = gerarCodigoBilhete();
      const existe = await query('SELECT id FROM bilhetes WHERE codigo = $1', [codigo]);
      if (existe.rowCount === 0) break;
      tentativas++;
    }

    const { rows } = await query(
      `INSERT INTO bilhetes
        (evento_id, codigo, comprador_nome, comprador_telefone, tipo, preco, estado)
       VALUES ($1,$2,$3,$4,$5,$6,'pendente')
       RETURNING *`,
      [
        evento_id,
        codigo,
        comprador_nome || null,
        comprador_telefone || null,
        tipoFinal,
        preco
      ]
    );

    res.status(201).json({ ok: true, bilhete: rows[0] });
  } catch (e) {
    console.error('[bilhetes/create]', e);
    res.status(500).json({ ok: false, error: e.message || 'Erro no servidor' });
  }
});

/* ============================================================
   GET /api/bilhetes — listar todos (admin)
   Query: ?evento_id=..&estado=..&tipo=..
   ============================================================ */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { evento_id, estado, tipo } = req.query;
    const params = [];
    const where = [];

    if (evento_id) {
      params.push(Number(evento_id));
      where.push(`b.evento_id = $${params.length}`);
    }
    if (estado) {
      params.push(estado);
      where.push(`b.estado = $${params.length}`);
    }
    if (tipo) {
      params.push(tipo);
      where.push(`b.tipo = $${params.length}`);
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await query(
      `SELECT
        b.*,
        e.nome AS evento_nome,
        e.slug AS evento_slug,
        e.data_evento,
        e.local
       FROM bilhetes b
       JOIN eventos e ON e.id = b.evento_id
       ${whereSQL}
       ORDER BY b.criado_em DESC
       LIMIT 500`,
      params
    );

    res.json({ ok: true, total: rows.length, bilhetes: rows });
  } catch (e) {
    console.error('[bilhetes/list]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* ============================================================
   GET /api/bilhetes/:codigo — busca pública por código
   Usado pelo scanner / frontend de validação.
   Retorna dados mínimos de validação (sem expor telefone).
   ============================================================ */
router.get('/:codigo', async (req, res) => {
  try {
    const codigo = String(req.params.codigo || '').trim().toUpperCase();

    const { rows } = await query(
      `SELECT
        b.id, b.codigo, b.tipo, b.preco, b.estado,
        b.usado_em, b.criado_em,
        e.id AS evento_id, e.nome AS evento_nome, e.slug AS evento_slug,
        e.data_evento, e.local,
        e.empresa_nome, e.empresa_logo_url
       FROM bilhetes b
       JOIN eventos e ON e.id = b.evento_id
       WHERE b.codigo = $1`,
      [codigo]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'Bilhete não encontrado', valido: false });
    }

    const b = rows[0];

    res.json({
      ok: true,
      valido: b.estado === 'ativo' && !b.usado_em,
      bilhete: b
    });
  } catch (e) {
    console.error('[bilhetes/get]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* ============================================================
   PATCH /api/bilhetes/:id/estado — muda estado (admin)
   Body: { estado: 'pendente' | 'ativo' | 'cancelado' }
   ============================================================ */
router.patch('/:id/estado', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { estado } = req.body || {};

    const estadosValidos = ['pendente', 'ativo', 'cancelado'];
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({
        ok: false,
        error: 'estado deve ser um de: ' + estadosValidos.join(', ')
      });
    }

    const { rows } = await query(
      'UPDATE bilhetes SET estado = $1 WHERE id = $2 RETURNING *',
      [estado, id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'Bilhete não encontrado' });
    }

    res.json({ ok: true, bilhete: rows[0] });
  } catch (e) {
    console.error('[bilhetes/estado]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* ============================================================
   PATCH /api/bilhetes/:id/upgrade — Normal → VIP (admin)
   Regra: só sobe, nunca desce.
   ============================================================ */
router.patch('/:id/upgrade', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const atual = await query(
      `SELECT b.*, e.preco_normal, e.preco_vip
       FROM bilhetes b
       JOIN eventos e ON e.id = b.evento_id
       WHERE b.id = $1`,
      [id]
    );

    if (!atual.rowCount) {
      return res.status(404).json({ ok: false, error: 'Bilhete não encontrado' });
    }

    const b = atual.rows[0];

    if (b.tipo === 'vip') {
      return res.status(400).json({
        ok: false,
        error: 'Bilhete já é VIP. Não é possível descer para Normal.'
      });
    }

    const { rows } = await query(
      `UPDATE bilhetes
       SET tipo = 'vip', preco = $1
       WHERE id = $2
       RETURNING *`,
      [b.preco_vip, id]
    );

    res.json({
      ok: true,
      message: 'Bilhete promovido a VIP',
      bilhete: rows[0]
    });
  } catch (e) {
    console.error('[bilhetes/upgrade]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* ============================================================
   DELETE /api/bilhetes/:id — apagar (admin)
   ============================================================ */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rowCount } = await query('DELETE FROM bilhetes WHERE id = $1', [id]);

    if (!rowCount) {
      return res.status(404).json({ ok: false, error: 'Bilhete não encontrado' });
    }

    res.json({ ok: true, message: 'Bilhete apagado' });
  } catch (e) {
    console.error('[bilhetes/delete]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});


/* ============================================================
   GET /api/bilhetes/:codigo/qr — PNG com QR code
   ============================================================ */
router.get('/:codigo/qr', async (req, res) => {
  try {
    const codigo = String(req.params.codigo || '').trim().toUpperCase();

    const { rows } = await query('SELECT id FROM bilhetes WHERE codigo = $1', [codigo]);
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'Bilhete não encontrado' });
    }

    const buffer = await gerarQRBuffer(codigo, { width: 600 });

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (e) {
    console.error('[bilhetes/qr]', e);
    res.status(500).json({ ok: false, error: 'Erro ao gerar QR' });
  }
});

/* ============================================================
   GET /api/bilhetes/:codigo/barcode — PNG com Code128
   ============================================================ */
router.get('/:codigo/barcode', async (req, res) => {
  try {
    const codigo = String(req.params.codigo || '').trim().toUpperCase();

    const { rows } = await query('SELECT id FROM bilhetes WHERE codigo = $1', [codigo]);
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'Bilhete não encontrado' });
    }

    const buffer = await gerarBarcodeBuffer(codigo, { scale: 3, height: 14 });

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (e) {
    console.error('[bilhetes/barcode]', e);
    res.status(500).json({ ok: false, error: 'Erro ao gerar código de barras' });
  }
});

/* ============================================================
   GET /api/bilhetes/:codigo/validar-info — info mínima para scanner
   (rota para o frontend de validação ler sem precisar de auth)
   Nota: usa GET /:codigo já existente; esta é só um alias semântico.
   ============================================================ */


/* ============================================================
   GET /api/bilhetes/:codigo/pdf — PDF do bilhete (A5)
   ============================================================ */
router.get('/:codigo/pdf', async (req, res) => {
  try {
    const codigo = String(req.params.codigo || '').trim().toUpperCase();

    const { rows } = await query(
      `SELECT
        b.id, b.codigo, b.tipo, b.preco, b.estado, b.usado_em,
        b.comprador_nome, b.comprador_telefone,
        e.nome AS evento_nome, e.slug AS evento_slug,
        e.data_evento, e.local,
        e.empresa_nome, e.empresa_logo_url
       FROM bilhetes b
       JOIN eventos e ON e.id = b.evento_id
       WHERE b.codigo = $1`,
      [codigo]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'Bilhete não encontrado' });
    }

    console.log('[PDF] bilhete recebido:', {
      codigo: rows[0].codigo,
      empresa_nome: rows[0].empresa_nome,
      empresa_logo_url: rows[0].empresa_logo_url ? 'SIM' : 'NAO'
    });

    const pdfBuffer = await gerarBilhetePDF(rows[0]);

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="bilhete-${codigo}.pdf"`);
    res.set('Cache-Control', 'no-cache');
    res.send(pdfBuffer);
  } catch (e) {
    console.error('[bilhetes/pdf]', e);
    res.status(500).json({ ok: false, error: 'Erro ao gerar PDF' });
  }
});


/* ============================================================
   POST /api/bilhetes/:codigo/validar — marcar como usado (admin)
   Retorna:
     - resultado: 'verde' | 'vermelho'
     - motivo: texto quando vermelho
     - bilhete: dados (quando verde)
   ============================================================ */
router.post('/:codigo/validar', requireAuth, async (req, res) => {
  const adminId = req.admin?.id;
  const codigo = String(req.params.codigo || '').trim().toUpperCase();

  try {
    // Busca bilhete com dados do evento
    const { rows } = await query(
      `SELECT b.*, e.nome AS evento_nome, e.slug AS evento_slug,
              e.data_evento, e.local
       FROM bilhetes b
       JOIN eventos e ON e.id = b.evento_id
       WHERE b.codigo = $1`,
      [codigo]
    );

    if (!rows.length) {
      // Regista tentativa inválida
      await query(
        `INSERT INTO validacoes (bilhete_id, admin_id, resultado, notas)
         VALUES (NULL, $1, 'invalido', 'Código não encontrado: ' || $2)`,
        [adminId, codigo]
      );
      return res.json({
        ok: true,
        resultado: 'vermelho',
        motivo: 'Bilhete não encontrado',
        codigo
      });
    }

    const b = rows[0];

    // Já usado?
    if (b.usado_em) {
      await query(
        `INSERT INTO validacoes (bilhete_id, admin_id, resultado, notas)
         VALUES ($1, $2, 'repetido', 'Tentativa de reutilização')`,
        [b.id, adminId]
      );
      return res.json({
        ok: true,
        resultado: 'vermelho',
        motivo: 'Bilhete já foi usado em ' + new Date(b.usado_em).toLocaleString('pt-PT'),
        bilhete: {
          id: b.id,
          codigo: b.codigo,
          tipo: b.tipo,
          comprador_nome: b.comprador_nome,
          evento_nome: b.evento_nome,
          usado_em: b.usado_em
        }
      });
    }

    // Cancelado?
    if (b.estado === 'cancelado') {
      await query(
        `INSERT INTO validacoes (bilhete_id, admin_id, resultado, notas)
         VALUES ($1, $2, 'cancelado', 'Bilhete cancelado')`,
        [b.id, adminId]
      );
      return res.json({
        ok: true,
        resultado: 'vermelho',
        motivo: 'Bilhete cancelado',
        bilhete: { id: b.id, codigo: b.codigo, tipo: b.tipo, comprador_nome: b.comprador_nome, evento_nome: b.evento_nome }
      });
    }

    // Ainda pendente (não pago)?
    if (b.estado === 'pendente') {
      await query(
        `INSERT INTO validacoes (bilhete_id, admin_id, resultado, notas)
         VALUES ($1, $2, 'pendente', 'Pagamento ainda não confirmado')`,
        [b.id, adminId]
      );
      return res.json({
        ok: true,
        resultado: 'vermelho',
        motivo: 'Pagamento ainda não confirmado',
        bilhete: { id: b.id, codigo: b.codigo, tipo: b.tipo, comprador_nome: b.comprador_nome, evento_nome: b.evento_nome }
      });
    }

    // Está tudo bem — marca como usado
    const update = await query(
      `UPDATE bilhetes
       SET usado_em = NOW(), usado_por_admin_id = $1
       WHERE id = $2
       RETURNING *`,
      [adminId, b.id]
    );

    await query(
      `INSERT INTO validacoes (bilhete_id, admin_id, resultado, notas)
       VALUES ($1, $2, 'valido', 'Entrada autorizada')`,
      [b.id, adminId]
    );

    res.json({
      ok: true,
      resultado: 'verde',
      motivo: 'Entrada autorizada',
      bilhete: {
        id: update.rows[0].id,
        codigo: update.rows[0].codigo,
        tipo: update.rows[0].tipo,
        preco: update.rows[0].preco,
        comprador_nome: update.rows[0].comprador_nome,
        comprador_telefone: update.rows[0].comprador_telefone,
        evento_nome: b.evento_nome,
        evento_slug: b.evento_slug,
        data_evento: b.data_evento,
        local: b.local,
        usado_em: update.rows[0].usado_em
      }
    });
  } catch (e) {
    console.error('[bilhetes/validar]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* ============================================================
   GET /api/bilhetes/:id/validacoes — histórico (admin)
   ============================================================ */
router.get('/:id/validacoes', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query(
      `SELECT v.*, a.username AS admin_username
       FROM validacoes v
       LEFT JOIN admins a ON a.id = v.admin_id
       WHERE v.bilhete_id = $1
       ORDER BY v.criado_em DESC`,
      [id]
    );
    res.json({ ok: true, total: rows.length, validacoes: rows });
  } catch (e) {
    console.error('[bilhetes/validacoes]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});


export default router;
