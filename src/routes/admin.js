import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import cloudinary from 'cloudinary';

const router = express.Router();

/* Cache simples em memória — 15 segundos */
let cache = null;
let cacheTs = 0;
const CACHE_MS = 60000;

router.get('/stats', requireAuth, async (req, res) => {
  const agora = Date.now();
  if (cache && (agora - cacheTs) < CACHE_MS) {
    return res.json({ ok: true, ...cache, cached: true });
  }

  try {
    /* 3 queries em paralelo em vez de 7 */
    const [principais, ultimos, vendas] = await Promise.all([

      // 1. Agregados numa só query
      query(`
        SELECT
          (SELECT COUNT(*)::int FROM eventos) AS ev_total,
          (SELECT COUNT(*)::int FROM eventos WHERE ativo) AS ev_ativos,
          (SELECT COUNT(*)::int FROM eventos WHERE NOT ativo) AS ev_inativos,

          (SELECT COUNT(*)::int FROM bilhetes) AS bi_total,
          (SELECT COUNT(*)::int FROM bilhetes WHERE estado = 'pendente') AS bi_pendentes,
          (SELECT COUNT(*)::int FROM bilhetes WHERE estado = 'ativo') AS bi_ativos,
          (SELECT COUNT(*)::int FROM bilhetes WHERE estado = 'cancelado') AS bi_cancelados,
          (SELECT COUNT(*)::int FROM bilhetes WHERE usado_em IS NOT NULL) AS bi_usados,
          (SELECT COUNT(*)::int FROM bilhetes WHERE tipo = 'vip') AS bi_vip,
          (SELECT COUNT(*)::int FROM bilhetes WHERE tipo = 'normal') AS bi_normal,

          (SELECT COALESCE(SUM(preco),0)::int FROM bilhetes WHERE estado <> 'cancelado') AS rec_total,
          (SELECT COALESCE(SUM(preco),0)::int FROM bilhetes WHERE estado = 'ativo') AS rec_conf,
          (SELECT COALESCE(SUM(preco),0)::int FROM bilhetes WHERE estado = 'pendente') AS rec_pend,

          (SELECT COUNT(*)::int FROM admins) AS ad_total,
          (SELECT COUNT(*)::int FROM admins WHERE ativo) AS ad_ativos,

          (SELECT COUNT(*)::int FROM validacoes WHERE criado_em >= CURRENT_DATE) AS va_total,
          (SELECT COUNT(*)::int FROM validacoes WHERE criado_em >= CURRENT_DATE AND resultado = 'valido') AS va_validos,
          (SELECT COUNT(*)::int FROM validacoes WHERE criado_em >= CURRENT_DATE AND resultado = 'repetido') AS va_repetidos,
          (SELECT COUNT(*)::int FROM validacoes WHERE criado_em >= CURRENT_DATE AND resultado = 'invalido') AS va_invalidos
      `),

      // 2. Últimos bilhetes
      query(`
        SELECT b.id, b.codigo, b.tipo, b.preco, b.estado, b.criado_em,
               b.comprador_nome, e.nome AS evento_nome
        FROM bilhetes b
        JOIN eventos e ON e.id = b.evento_id
        ORDER BY b.criado_em DESC
        LIMIT 8
      `),

      // 3. Top eventos
      query(`
        SELECT e.id, e.nome,
               COUNT(b.id)::int AS total_bilhetes,
               COALESCE(SUM(b.preco), 0)::int AS receita
        FROM eventos e
        LEFT JOIN bilhetes b ON b.evento_id = e.id AND b.estado <> 'cancelado'
        GROUP BY e.id, e.nome
        ORDER BY total_bilhetes DESC
        LIMIT 5
      `)
    ]);

    const p = principais.rows[0];
    const dados = {
      eventos: { total: p.ev_total, ativos: p.ev_ativos, inativos: p.ev_inativos },
      bilhetes: {
        total: p.bi_total, pendentes: p.bi_pendentes, ativos: p.bi_ativos,
        cancelados: p.bi_cancelados, usados: p.bi_usados,
        vip: p.bi_vip, normal: p.bi_normal
      },
      receita: { total: p.rec_total, confirmada: p.rec_conf, pendente: p.rec_pend },
      admins: { total: p.ad_total, ativos: p.ad_ativos },
      validacoesHoje: {
        total: p.va_total, validos: p.va_validos,
        repetidos: p.va_repetidos, invalidos: p.va_invalidos
      },
      ultimosBilhetes: ultimos.rows,
      vendasPorEvento: vendas.rows,
      timestamp: new Date().toISOString()
    };

    cache = dados;
    cacheTs = agora;

    res.json({ ok: true, ...dados });
  } catch (e) {
    console.error('[admin/stats]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

router.get('/contas', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT id, username, role, ativo, criado_em
      FROM admins ORDER BY criado_em ASC
    `);
    res.json({ ok: true, contas: rows });
  } catch (e) {
    console.error('[admin/contas]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});


/* ============================================================
   GET /api/admin/armazenamento — uso de espaço e contagens
   ============================================================ */
router.get('/armazenamento', requireAuth, async (req, res) => {
  try {
    // 1. Uso do Cloudinary
    let cloud = {
      disponivel: false,
      usado_mb: 0,
      limite_mb: 25600,
      percentagem: 0,
      ficheiros: 0,
      bandwidth_mb: 0,
      plano: 'unknown'
    };

    try {
      const usage = await cloudinary.v2.api.usage();
      const usado_bytes = usage.storage?.usage || 0;
      const limite_bytes = usage.storage?.limit || 0;
      const usado_mb = Math.round(usado_bytes / 1024 / 1024 * 100) / 100;
      const limite_mb = Math.round(limite_bytes / 1024 / 1024);

      cloud = {
        disponivel: true,
        usado_mb: usado_mb,
        limite_mb: limite_mb || 25600,
        percentagem: limite_mb > 0 ? Math.round((usado_mb / limite_mb) * 100) : 0,
        ficheiros: usage.resources || 0,
        bandwidth_mb: Math.round((usage.bandwidth?.usage || 0) / 1024 / 1024),
        plano: usage.plan || 'Free'
      };
    } catch (e) {
      console.warn('[armazenamento] Cloudinary falhou:', e.message);
    }

    // 2. Contagens na base de dados
    const { rows: contagens } = await query(`
      SELECT
        (SELECT COUNT(*)::int FROM eventos) AS eventos,
        (SELECT COUNT(*)::int FROM bilhetes) AS bilhetes,
        (SELECT COUNT(*)::int FROM admins) AS admins,
        (SELECT COUNT(*)::int FROM validacoes) AS validacoes,
        (SELECT COUNT(*)::int FROM eventos WHERE poster_url IS NOT NULL) AS eventos_com_poster,
        (SELECT COUNT(*)::int FROM eventos WHERE empresa_logo_url IS NOT NULL) AS eventos_com_logo,
        (SELECT COUNT(*)::int FROM eventos WHERE foto1_url IS NOT NULL) AS eventos_foto1,
        (SELECT COUNT(*)::int FROM eventos WHERE foto2_url IS NOT NULL) AS eventos_foto2
    `);

    // 3. Top eventos por número de imagens
    const { rows: topEventos } = await query(`
      SELECT
        id, nome, slug,
        (CASE WHEN poster_url IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN empresa_logo_url IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN foto1_url IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN foto2_url IS NOT NULL THEN 1 ELSE 0 END) AS total_imagens
      FROM eventos
      ORDER BY total_imagens DESC, id DESC
      LIMIT 5
    `);

    // 4. Estimativa total de imagens
    const c = contagens[0];
    const totalImagens =
      c.eventos_com_poster +
      c.eventos_com_logo +
      c.eventos_foto1 +
      c.eventos_foto2;

    res.json({
      ok: true,
      cloudinary: cloud,
      base_dados: {
        eventos: c.eventos,
        bilhetes: c.bilhetes,
        admins: c.admins,
        validacoes: c.validacoes,
        total_registos: c.eventos + c.bilhetes + c.admins + c.validacoes
      },
      imagens: {
        total: totalImagens,
        posters: c.eventos_com_poster,
        logos: c.eventos_com_logo,
        fotos_extra: c.eventos_foto1 + c.eventos_foto2
      },
      top_eventos: topEventos,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error('[admin/armazenamento]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});


export default router;
