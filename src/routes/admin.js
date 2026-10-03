import express from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';

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

export default router;
