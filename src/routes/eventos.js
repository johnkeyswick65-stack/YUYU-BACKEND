import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { upload } from '../upload.js';
import { uploadBuffer, apagarImagem } from '../cloudinary.js';
import { gerarSlug } from '../utils/slug.js';

const router = express.Router();

/* Cache em memória para a lista pública de eventos */
let listaCache = null;
let listaTs = 0;
const LISTA_TTL = 60000; // 60s
function invalidarCache() { listaCache = null; listaTs = 0; }

/* GET /api/eventos — lista pública (só ativos) */
router.get('/', async (req, res) => {
  try {
    const { categoria, busca } = req.query;
    const semFiltros = !categoria && !busca;

    // Só serve cache quando não há filtros (chamada mais comum)
    if (semFiltros && listaCache && (Date.now() - listaTs) < LISTA_TTL) {
      res.set('X-Cache', 'HIT');
      return res.json({ ok: true, eventos: listaCache, cached: true });
    }

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
              poster_url, preco_normal, preco_vip, criado_em,
              empresa_nome, empresa_logo_url,
              foto1_url, foto1_descricao, foto2_url, foto2_descricao
       FROM eventos
       WHERE ${where.join(' AND ')}
       ORDER BY data_evento ASC`,
      params
    );

    if (semFiltros) {
      listaCache = rows;
      listaTs = Date.now();
    }

    res.set('X-Cache', 'MISS');
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
              poster_url, preco_normal, preco_vip,
              empresa_nome, empresa_logo_url,
              foto1_url, foto1_descricao, foto2_url, foto2_descricao
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
const camposUpload = upload.fields([
  { name: 'poster', maxCount: 1 },
  { name: 'empresa_logo', maxCount: 1 },
  { name: 'foto1', maxCount: 1 },
  { name: 'foto2', maxCount: 1 }
]);

router.post('/', requireAuth, camposUpload, async (req, res) => {
  try {
    const {
      nome, descricao, data_evento, local, categoria,
      preco_normal, preco_vip, poster_url,
      empresa_nome, foto1_descricao, foto2_descricao
    } = req.body;

    if (!nome || !data_evento || !local) {
      return res.status(400).json({ ok: false, error: 'Nome, data_evento e local são obrigatórios' });
    }

    let slug = req.body.slug || gerarSlug(nome);
    let posterUrl = poster_url || null;
    let posterPublicId = null;

    // Se vier ficheiro (poster), faz upload primeiro
    if (req.files && req.files.poster && req.files.poster[0]) {
      const resultado = await uploadBuffer(req.files.poster[0].buffer, 'yuyu-eventos');
      posterUrl = resultado.secure_url;
      posterPublicId = resultado.public_id;
    }

    // Logo da empresa
    let empresaLogoUrl = null;
    let empresaLogoPublicId = null;
    if (req.files && req.files.empresa_logo && req.files.empresa_logo[0]) {
      const r = await uploadBuffer(req.files.empresa_logo[0].buffer, 'yuyu-eventos/empresas');
      empresaLogoUrl = r.secure_url;
      empresaLogoPublicId = r.public_id;
    }

    // Foto extra 1
    let foto1Url = null;
    let foto1PublicId = null;
    if (req.files && req.files.foto1 && req.files.foto1[0]) {
      const r = await uploadBuffer(req.files.foto1[0].buffer, 'yuyu-eventos/galeria');
      foto1Url = r.secure_url;
      foto1PublicId = r.public_id;
    }

    // Foto extra 2
    let foto2Url = null;
    let foto2PublicId = null;
    if (req.files && req.files.foto2 && req.files.foto2[0]) {
      const r = await uploadBuffer(req.files.foto2[0].buffer, 'yuyu-eventos/galeria');
      foto2Url = r.secure_url;
      foto2PublicId = r.public_id;
    }

    // Garantir slug único
    const existeSlug = await query('SELECT id FROM eventos WHERE slug = $1', [slug]);
    if (existeSlug.rowCount > 0) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const { rows } = await query(
      `INSERT INTO eventos
        (nome, slug, descricao, data_evento, local, categoria,
         poster_url, poster_public_id, preco_normal, preco_vip,
         empresa_nome, empresa_logo_url, empresa_logo_public_id,
         foto1_url, foto1_public_id, foto1_descricao,
         foto2_url, foto2_public_id, foto2_descricao)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        nome, slug, descricao || null, data_evento, local, categoria || 'outros',
        posterUrl, posterPublicId,
        Number(preco_normal) || 0, Number(preco_vip) || 0,
        empresa_nome || null, empresaLogoUrl, empresaLogoPublicId,
        foto1Url, foto1PublicId, foto1_descricao || null,
        foto2Url, foto2PublicId, foto2_descricao || null
      ]
    );

    invalidarCache();
    res.status(201).json({ ok: true, evento: rows[0] });
  } catch (e) {
    console.error('[eventos/create]', e);
    res.status(500).json({ ok: false, error: e.message || 'Erro no servidor' });
  }
});

/* PUT /api/eventos/:id — editar (admin) */
router.put('/:id', requireAuth, camposUpload, async (req, res) => {
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
      preco_normal, preco_vip, poster_url, ativo,
      empresa_nome, foto1_descricao, foto2_descricao
    } = req.body;

    let posterUrl = poster_url !== undefined ? poster_url : ev.poster_url;
    let posterPublicId = ev.poster_public_id;

    if (req.files && req.files.poster && req.files.poster[0]) {
      if (ev.poster_public_id) await apagarImagem(ev.poster_public_id);
      const resultado = await uploadBuffer(req.files.poster[0].buffer, 'yuyu-eventos');
      posterUrl = resultado.secure_url;
      posterPublicId = resultado.public_id;
    }

    // Logo da empresa
    let empresaLogoUrl = ev.empresa_logo_url;
    let empresaLogoPublicId = ev.empresa_logo_public_id;
    if (req.files && req.files.empresa_logo && req.files.empresa_logo[0]) {
      if (ev.empresa_logo_public_id) await apagarImagem(ev.empresa_logo_public_id);
      const r = await uploadBuffer(req.files.empresa_logo[0].buffer, 'yuyu-eventos/empresas');
      empresaLogoUrl = r.secure_url;
      empresaLogoPublicId = r.public_id;
    }

    // Foto extra 1
    let foto1Url = ev.foto1_url;
    let foto1PublicId = ev.foto1_public_id;
    if (req.files && req.files.foto1 && req.files.foto1[0]) {
      if (ev.foto1_public_id) await apagarImagem(ev.foto1_public_id);
      const r = await uploadBuffer(req.files.foto1[0].buffer, 'yuyu-eventos/galeria');
      foto1Url = r.secure_url;
      foto1PublicId = r.public_id;
    }

    // Foto extra 2
    let foto2Url = ev.foto2_url;
    let foto2PublicId = ev.foto2_public_id;
    if (req.files && req.files.foto2 && req.files.foto2[0]) {
      if (ev.foto2_public_id) await apagarImagem(ev.foto2_public_id);
      const r = await uploadBuffer(req.files.foto2[0].buffer, 'yuyu-eventos/galeria');
      foto2Url = r.secure_url;
      foto2PublicId = r.public_id;
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
        empresa_nome = COALESCE($11, empresa_nome),
        empresa_logo_url = $12,
        empresa_logo_public_id = $13,
        foto1_url = $14,
        foto1_public_id = $15,
        foto1_descricao = COALESCE($16, foto1_descricao),
        foto2_url = $17,
        foto2_public_id = $18,
        foto2_descricao = COALESCE($19, foto2_descricao),
        atualizado_em = NOW()
       WHERE id = $20
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
        empresa_nome || null,
        empresaLogoUrl,
        empresaLogoPublicId,
        foto1Url,
        foto1PublicId,
        foto1_descricao || null,
        foto2Url,
        foto2PublicId,
        foto2_descricao || null,
        id
      ]
    );

    invalidarCache();
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
    invalidarCache();
    res.json({ ok: true, message: 'Evento apagado' });
  } catch (e) {
    console.error('[eventos/delete]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

export default router;
