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



/* ============================================================
   GET /api/admin/imagens — lista todas as imagens no Cloudinary
   Marca quais são órfãs (não ligadas a nenhum evento)
   ============================================================ */
router.get('/imagens', requireAuth, async (req, res) => {
  try {
    // 1. Buscar todas as imagens do Cloudinary (até 500)
    let recursos = [];
    try {
      const resultado = await cloudinary.v2.api.resources({
        type: 'upload',
        max_results: 500,
        resource_type: 'image'
      });
      recursos = resultado.resources || [];
    } catch (e) {
      console.error('[imagens] Cloudinary falhou:', e.message);
      return res.status(500).json({ ok: false, error: 'Falha ao listar imagens do Cloudinary' });
    }

    // 2. Buscar todos os public_ids em uso nos eventos
    const { rows: eventos } = await query(`
      SELECT id, nome, slug,
             poster_public_id, empresa_logo_public_id,
             foto1_public_id, foto2_public_id
      FROM eventos
    `);

    const usados = new Set();
    const mapaEvento = {};

    eventos.forEach(ev => {
      [['poster', ev.poster_public_id],
       ['logo', ev.empresa_logo_public_id],
       ['foto1', ev.foto1_public_id],
       ['foto2', ev.foto2_public_id]].forEach(([tipo, pid]) => {
        if (pid) {
          usados.add(pid);
          mapaEvento[pid] = { evento_id: ev.id, evento_nome: ev.nome, tipo };
        }
      });
    });

    // 3. Montar a lista
    const imagens = recursos.map(r => {
      const emUso = usados.has(r.public_id);
      return {
        public_id: r.public_id,
        url: r.secure_url,
        thumbnail: r.secure_url.replace('/upload/', '/upload/w_150,h_150,c_fill/'),
        bytes: r.bytes,
        kb: Math.round(r.bytes / 1024),
        formato: r.format,
        largura: r.width,
        altura: r.height,
        criado_em: r.created_at,
        em_uso: emUso,
        orfa: !emUso,
        evento: emUso ? mapaEvento[r.public_id].evento_nome : null,
        tipo: emUso ? mapaEvento[r.public_id].tipo : null
      };
    });

    // Ordenar: órfãs primeiro, maiores primeiro
    imagens.sort((a, b) => {
      if (a.orfa !== b.orfa) return a.orfa ? -1 : 1;
      return b.bytes - a.bytes;
    });

    const totalBytes = imagens.reduce((s, i) => s + i.bytes, 0);
    const orfasBytes = imagens.filter(i => i.orfa).reduce((s, i) => s + i.bytes, 0);
    const usadosBytes = totalBytes - orfasBytes;

    res.json({
      ok: true,
      total: imagens.length,
      total_mb: Math.round(totalBytes / 1024 / 1024 * 100) / 100,
      orfas: imagens.filter(i => i.orfa).length,
      orfas_mb: Math.round(orfasBytes / 1024 / 1024 * 100) / 100,
      em_uso: imagens.filter(i => !i.orfa).length,
      em_uso_mb: Math.round(usadosBytes / 1024 / 1024 * 100) / 100,
      imagens: imagens
    });
  } catch (e) {
    console.error('[admin/imagens]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* ============================================================
   POST /api/admin/imagens/apagar
   Body: { public_ids: ['id1', 'id2', ...] }
   Apaga apenas os IDs indicados.
   ============================================================ */
router.post('/imagens/apagar', requireAuth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.public_ids) ? req.body.public_ids : [];
    if (!ids.length) {
      return res.status(400).json({ ok: false, error: 'Nenhum ID fornecido' });
    }

    // Verificar quais estão em uso (não deixar apagar)
    const { rows: eventos } = await query(`
      SELECT poster_public_id, empresa_logo_public_id,
             foto1_public_id, foto2_public_id
      FROM eventos
    `);

    const emUso = new Set();
    eventos.forEach(ev => {
      [ev.poster_public_id, ev.empresa_logo_public_id,
       ev.foto1_public_id, ev.foto2_public_id].forEach(pid => {
        if (pid) emUso.add(pid);
      });
    });

    const seguros = ids.filter(id => !emUso.has(id));
    const bloqueados = ids.filter(id => emUso.has(id));

    const apagados = [];
    const erros = [];

    for (const pid of seguros) {
      try {
        const r = await cloudinary.v2.uploader.destroy(pid);
        if (r.result === 'ok') apagados.push(pid);
        else erros.push({ id: pid, motivo: r.result });
      } catch (e) {
        erros.push({ id: pid, motivo: e.message });
      }
    }

    res.json({
      ok: true,
      apagados: apagados.length,
      bloqueados: bloqueados.length,
      bloqueados_ids: bloqueados,
      erros: erros,
      detalhe: { apagados, erros }
    });
  } catch (e) {
    console.error('[admin/imagens/apagar]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});



/* ============================================================
   GET /api/admin/acessos — lista de acessos recentes
   Query: ?limit=100&ip=1.2.3.4
   ============================================================ */
router.get('/acessos', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const ipFiltro = req.query.ip ? String(req.query.ip).trim() : null;
    const apenasSuspeitos = req.query.suspeitos === '1';

    const params = [];
    const where = [];

    if (ipFiltro) {
      params.push(ipFiltro);
      where.push(`ip = $${params.length}`);
    }

    if (apenasSuspeitos) {
      where.push(`(status >= 400 OR rota LIKE '%/auth/login%')`);
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    params.push(limit);
    const { rows } = await query(
      `SELECT a.*, adm.username AS admin_username
       FROM acessos a
       LEFT JOIN admins adm ON adm.id = a.admin_id
       ${whereSQL}
       ORDER BY a.criado_em DESC
       LIMIT $${params.length}`,
      params
    );

    res.json({ ok: true, total: rows.length, acessos: rows });
  } catch (e) {
    console.error('[admin/acessos]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* ============================================================
   GET /api/admin/acessos/resumo — IPs mais activos
   ============================================================ */
router.get('/acessos/resumo', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        ip,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status >= 400)::int AS erros,
        MAX(criado_em) AS ultimo_acesso,
        COUNT(DISTINCT rota)::int AS rotas_distintas
      FROM acessos
      WHERE criado_em > NOW() - INTERVAL '24 hours'
      GROUP BY ip
      ORDER BY total DESC
      LIMIT 30
    `);

    // Bloqueados
    const { rows: bloqueados } = await query(`
      SELECT b.*, a.username AS admin_username
      FROM bloqueios b
      LEFT JOIN admins a ON a.id = b.bloqueado_por
      WHERE b.expira_em IS NULL OR b.expira_em > NOW()
      ORDER BY b.criado_em DESC
    `);

    res.json({
      ok: true,
      ips_activos: rows,
      bloqueados
    });
  } catch (e) {
    console.error('[admin/acessos/resumo]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* ============================================================
   POST /api/admin/bloquear — bloquear um IP
   Body: { ip, motivo, horas }
   ============================================================ */
router.post('/bloquear', requireAuth, async (req, res) => {
  try {
    const ip = String(req.body?.ip || '').trim();
    const motivo = String(req.body?.motivo || 'Sem motivo').slice(0, 200);
    const horas = Number(req.body?.horas) || 0; // 0 = permanente

    if (!ip) {
      return res.status(400).json({ ok: false, error: 'IP obrigatório' });
    }

    const expira = horas > 0
      ? `NOW() + INTERVAL '${horas} hours'`
      : 'NULL';

    await query(
      `INSERT INTO bloqueios (ip, motivo, bloqueado_por, expira_em)
       VALUES ($1, $2, $3, ${expira})
       ON CONFLICT (ip) DO UPDATE
       SET motivo = EXCLUDED.motivo,
           bloqueado_por = EXCLUDED.bloqueado_por,
           criado_em = NOW(),
           expira_em = EXCLUDED.expira_em`,
      [ip, motivo, req.admin.id]
    );

    res.json({ ok: true, message: 'IP bloqueado' });
  } catch (e) {
    console.error('[admin/bloquear]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* ============================================================
   DELETE /api/admin/desbloquear/:ip
   ============================================================ */
router.delete('/desbloquear/:ip', requireAuth, async (req, res) => {
  try {
    const ip = String(req.params.ip || '').trim();
    const r = await query('DELETE FROM bloqueios WHERE ip = $1', [ip]);

    if (!r.rowCount) {
      return res.status(404).json({ ok: false, error: 'IP não está bloqueado' });
    }

    res.json({ ok: true, message: 'IP desbloqueado' });
  } catch (e) {
    console.error('[admin/desbloquear]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});

/* ============================================================
   DELETE /api/admin/acessos/limpar — limpa registos antigos
   Query: ?dias=30
   ============================================================ */
router.delete('/acessos/limpar', requireAuth, async (req, res) => {
  try {
    const dias = Math.max(1, Number(req.query.dias) || 30);
    const r = await query(
      `DELETE FROM acessos WHERE criado_em < NOW() - INTERVAL '${dias} days'`
    );
    res.json({ ok: true, apagados: r.rowCount });
  } catch (e) {
    console.error('[admin/acessos/limpar]', e);
    res.status(500).json({ ok: false, error: 'Erro no servidor' });
  }
});


export default router;
