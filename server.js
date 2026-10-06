import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { registarEVerificar } from './src/middleware-acessos.js';
import { warmup } from './src/db.js';
import authRoutes from './src/routes/auth.js';
import eventosRoutes from './src/routes/eventos.js';
import bilhetesRoutes from './src/routes/bilhetes.js';
import adminRoutes from './src/routes/admin.js';
import clienteRoutes from './src/routes/cliente.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(registarEVerificar);
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'YUYU EVENTOS API',
    version: '0.5.0',
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/eventos', eventosRoutes);
app.use('/api/bilhetes', bilhetesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cliente', clienteRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'YUYU EVENTOS API — vê /api/health' });
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Rota não encontrada' });
});

app.use((err, req, res, next) => {
  console.error('[ERRO]', err.message);
  res.status(500).json({ ok: false, error: err.message || 'Erro interno' });
});

/* Acorda a base de dados ao arrancar */
warmup();

/* Keep-alive: ping a DB a cada 4 minutos para evitar cold start do Render */
import { query as dbQuery } from './src/db.js';
setInterval(async () => {
  try {
    const t = Date.now();
    await dbQuery('SELECT 1');
    console.log(`[KEEPALIVE] DB ping OK (${Date.now() - t}ms)`);
  } catch (e) {
    console.warn('[KEEPALIVE] DB ping falhou:', e.message);
  }
}, 4 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`\n✓ YUYU API v0.5.0 em http://localhost:${PORT}`);
  console.log(`  Health:   GET  /api/health`);
  console.log(`  Login:    POST /api/auth/login`);
  console.log(`  Eventos:  GET  /api/eventos`);
  console.log(`  Bilhetes: GET  /api/bilhetes`);
  console.log(`  Admin:    GET  /api/admin/stats\n`);
});
