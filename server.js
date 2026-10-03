import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

/* Middlewares */
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/* Health check — testa se o servidor está vivo */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'YUYU EVENTOS API',
    version: '0.1.0',
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

/* Rota raiz */
app.get('/', (req, res) => {
  res.json({ message: 'YUYU EVENTOS API — vê /api/health' });
});

/* 404 */
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Rota não encontrada' });
});

/* Erro genérico */
app.use((err, req, res, next) => {
  console.error('[ERRO]', err);
  res.status(500).json({ ok: false, error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`\n✓ YUYU API a correr em http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health\n`);
});
