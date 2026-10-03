import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { upload } from '../upload.js';
import { uploadBuffer, apagarImagem } from '../cloudinary.js';
import { gerarSlug } from '../utils/slug.js';

const router = express.Router();

/* GET /api/eventos — lista pública (só ativos) */
router.get('/', async (req, res) => {
  try {
    const { categoria, busca } = req.query;
    const params = [];
    const where = ['ativo = true'];

    if (categoria && categoria !== 'todos') {
      params.push(categoria);
      where.push(`categoria = $${params.length}`);
    }

    if (busca) {
      params.push(`%${busca}%`);
      where.push(`(nome ILIKE $${params.length} OR local ILIKE $${params.length})`);
    }

    const { rows } = await query(
      `SELECT id, nome, slug, descricao, data_evento, local, categoria,
              poster_url, preco_normal, preco_vip, criado_em
       FROM eventos
       WHERE ${where.join(' AND ')}
       ORDER BY data_evento ASC`,
      params
    );

    res.json({ ok: true, eventos: rows });
  } catch (e) {
    console.error('[eventos/list]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* GET /api/eventos/admin/todos — lista todos (inclui inativos) */
router.get('/admin/todos', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM eventos ORDER BY data_evento DESC`
    );
    res.json({ ok: true, eventos: rows });
  } catch (e) {
    console.error('[eventos/admin]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* GET /api/eventos/:slug — detalhe público */
router.get('/:slug', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, nome, slug, descricao, data_evento, local, categoria,
              poster_url, preco_normal, preco_vip
       FROM eventos
       WHERE slug = $1 AND ativo = true`,
      [req.params.slug]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'Evento não encontrado' });
    }

    res.json({ ok: true, evento: rows[0] });
  } catch (e) {
    console.error('[eventos/detalhe]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* POST /api/eventos — criar (admin) */
router.post('/', requireAuth, upload.single('poster'), async (req, res) => {
  try {
    const {
      nome, descricao, data_evento, local, categoria,
      preco_normal, preco_vip, poster_url
    } = req.body;

    if (!nome || !data_evento || !local) {
      return res.status(400).json({ ok: false, error: 'Nome, data_evento e local são obrigatórios' });
    }

    let slug = req.body.slug || gerarSlug(nome);
    let posterUrl = poster_url || null;
    let posterPublicId = null;

    // Se vier ficheiro, faz upload primeiro
    if (req.file) {
      const resultado = await uploadBuffer(req.file.buffer, 'yuyu-eventos');
      posterUrl = resultado.secure_url;
      posterPublicId = resultado.public_id;
    }

    // Garantir slug único
    const existeSlug = await query('SELECT id FROM eventos WHERE slug = $1', [slug]);
    if (existeSlug.rowCount > 0) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const { rows } = await query(
      `INSERT INTO eventos
        (nome, slug, descricao, data_evento, local, categoria,
         poster_url, poster_public_id, preco_normal, preco_vip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        nome,
        slug,
        descricao || null,
        data_evento,
        local,
        categoria || 'outros',
        posterUrl,
        posterPublicId,
        Number(preco_normal) || 0,
        Number(preco_vip) || 0
      ]
    );

    res.status(201).json({ ok: true, evento: rows[0] });
  } catch (e) {
    console.error('[eventos/create]', e);
    res.status(500).json({ ok: false, error: e.message || 'Erro no servidor' });
  }
});

/* PUT /api/eventos/:id — editar (admin) */
router.put('/:id', requireAuth, upload.single('poster'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: 'ID inválido' });

    const atual = await query('SELECT * FROM eventos WHERE id = $1', [id]);
    if (!atual.rowCount) {
      return res.status(404).json({ ok: false, error: 'Evento não encontrado' });
    }
    const ev = atual.rows[0];

    const {
      nome, descricao, data_evento, local, categoria,
      preco_normal, preco_vip, poster_url, ativo
    } = req.body;

    let posterUrl = poster_url !== undefined ? poster_url : ev.poster_url;
    let posterPublicId = ev.poster_public_id;

    if (req.file) {
      // Apaga a imagem antiga se existir
      if (ev.poster_public_id) await apagarImagem(ev.poster_public_id);
      const resultado = await uploadBuffer(req.file.buffer, 'yuyu-eventos');
      posterUrl = resultado.secure_url;
      posterPublicId = resultado.public_id;
    }

    const { rows } = await query(
      `UPDATE eventos SET
        nome = COALESCE($1, nome),
        descricao = COALESCE($2, descricao),
        data_evento = COALESCE($3, data_evento),
        local = COALESCE($4, local),
        categoria = COALESCE($5, categoria),
        preco_normal = COALESCE($6, preco_normal),
        preco_vip = COALESCE($7, preco_vip),
        poster_url = $8,
        poster_public_id = $9,
        ativo = COALESCE($10, ativo),
        atualizado_em = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        nome || null,
        descricao || null,
        data_evento || null,
        local || null,
        categoria || null,
        preco_normal != null ? Number(preco_normal) : null,
        preco_vip != null ? Number(preco_vip) : null,
        posterUrl,
        posterPublicId,
        ativo != null ? (ativo === 'true' || ativo === true) : null,
        id
      ]
    );

    res.json({ ok: true, evento: rows[0] });
  } catch (e) {
    console.error('[eventos/update]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* DELETE /api/eventos/:id — apagar (admin) */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const atual = await query('SELECT poster_public_id FROM eventos WHERE id = $1', [id]);
    if (!atual.rowCount) {
      return res.status(404).json({ ok: false, error: 'Evento não encontrado' });
    }

    if (atual.rows[0].poster_public_id) {
      await apagarImagem(atual.rows[0].poster_public_id);
    }

    await query('DELETE FROM eventos WHERE id = $1', [id]);
    res.json({ ok: true, message: 'Evento apagado' });
  } catch (e) {
    console.error('[eventos/delete]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

export default router;
