import { query } from './db.js';

/* Cache de IPs bloqueados (recarrega a cada 60s) */
let cacheBloqueados = new Set();
let cacheTs = 0;
const CACHE_MS = 60000;

async function carregarBloqueados() {
  if (Date.now() - cacheTs < CACHE_MS) return cacheBloqueados;
  try {
    const { rows } = await query(`
      SELECT ip FROM bloqueios
      WHERE expira_em IS NULL OR expira_em > NOW()
    `);
    cacheBloqueados = new Set(rows.map(r => r.ip));
    cacheTs = Date.now();
  } catch (e) {
    console.warn('[acessos] Falha ao carregar bloqueados:', e.message);
  }
  return cacheBloqueados;
}

/* Extrai o IP real (considerando proxies) */
function obterIP(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'desconhecido';
}

/* Middleware */
export function registarEVerificar(req, res, next) {
  const ip = obterIP(req);

  /* Ignora health check para não encher a tabela */
  if (req.path === '/api/health') return next();

  /* Verifica bloqueio */
  carregarBloqueados().then(bloqueados => {
    if (bloqueados.has(ip)) {
      console.warn('[acessos] IP bloqueado tentou aceder:', ip);
      return res.status(403).json({
        ok: false,
        error: 'Acesso negado. IP bloqueado.'
      });
    }
    next();
  }).catch(() => next());

  /* Registo é assíncrono — não atrasa a resposta */
  res.on('finish', () => {
    const adminId = req.admin?.id || null;
    query(
      `INSERT INTO acessos (ip, metodo, rota, status, user_agent, admin_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        ip,
        req.method,
        req.path,
        res.statusCode,
        String(req.headers['user-agent'] || '').slice(0, 250),
        adminId
      ]
    ).catch(() => {});
  });
}
