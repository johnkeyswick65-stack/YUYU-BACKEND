import PDFDocument from 'pdfkit';
import https from 'node:https';
import { gerarQRBuffer, gerarBarcodeBuffer } from './codigos-visuais.js';

/* A5 landscape: 210 x 148 mm = 595.3 x 419.5 pontos */
const LARGURA = 595.3;
const ALTURA = 419.5;

/* Cores por tipo */
const CORES = {
  vip: {
    principal: '#dc2626',
    escuro: '#7f1d1d',
    claro: '#fca5a5'
  },
  normal: {
    principal: '#2563eb',
    escuro: '#1e3a8a',
    claro: '#93c5fd'
  }
};

const PRETO = '#0a0a0a';
const PRETO_2 = '#141418';
const CINZA = '#888888';
const BRANCO = '#ffffff';

/* Desenha ícone calendário (data) */
function iconeData(doc, x, y, tam, cor) {
  doc.save();
  doc.strokeColor(cor).lineWidth(1.8).lineCap('round').lineJoin('round');
  const w = tam;
  const h = tam * 0.85;
  const r = 2.5;

  // Corpo
  doc.roundedRect(x, y + tam * 0.15, w, h, r).stroke();

  // Topo
  doc.moveTo(x, y + tam * 0.15 + h * 0.3).lineTo(x + w, y + tam * 0.15 + h * 0.3).stroke();

  // Anéis
  doc.moveTo(x + w * 0.28, y).lineTo(x + w * 0.28, y + tam * 0.25).stroke();
  doc.moveTo(x + w * 0.72, y).lineTo(x + w * 0.72, y + tam * 0.25).stroke();

  doc.restore();
}

/* Desenha ícone localização (pin) */
function iconeLocal(doc, x, y, tam, cor) {
  doc.save();
  doc.fillColor(cor).strokeColor(cor).lineWidth(1.8).lineCap('round').lineJoin('round');
  const cx = x + tam / 2;
  const cy = y + tam * 0.42;
  const r = tam * 0.3;

  // Círculo exterior (pin)
  doc.circle(cx, cy, r).stroke();

  // Ponta do pin
  doc.moveTo(cx - r * 0.75, cy + r * 0.75)
     .lineTo(cx, y + tam * 1.05)
     .lineTo(cx + r * 0.75, cy + r * 0.75)
     .stroke();

  // Círculo interior
  doc.circle(cx, cy, r * 0.35).fill();

  doc.restore();
}

/* Desenha ícone utilizador */
function iconeUser(doc, x, y, tam, cor) {
  doc.save();
  doc.strokeColor(cor).lineWidth(1.8).lineCap('round').lineJoin('round');
  const cx = x + tam / 2;

  // Cabeça
  doc.circle(cx, y + tam * 0.3, tam * 0.22).stroke();

  // Ombros
  doc.moveTo(x + tam * 0.12, y + tam * 0.98)
     .lineTo(x + tam * 0.12, y + tam * 0.78)
     .quadraticCurveTo(x + tam * 0.12, y + tam * 0.58, cx, y + tam * 0.58)
     .quadraticCurveTo(x + tam * 0.88, y + tam * 0.58, x + tam * 0.88, y + tam * 0.78)
     .lineTo(x + tam * 0.88, y + tam * 0.98)
     .stroke();

  doc.restore();
}

/* Desenha ícone bilhete (tipo) */
function iconeBilhete(doc, x, y, tam, cor) {
  doc.save();
  doc.strokeColor(cor).lineWidth(1.8).lineCap('round').lineJoin('round');
  const w = tam;
  const h = tam * 0.7;
  const r = 2.5;

  doc.roundedRect(x, y + tam * 0.15, w, h, r).stroke();

  // Furos laterais
  doc.circle(x + w * 0.14, y + tam * 0.15 + h / 2, 1.5).fill();
  doc.circle(x + w * 0.86, y + tam * 0.15 + h / 2, 1.5).fill();

  doc.restore();
}

/* Converte dados em Buffer */
function toBuffer(data) {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  return null;
}

/* Carrega imagem via https nativo */
function fetchImagemHttps(url) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const opts = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        timeout: 15000
      };
      const req = https.get(opts, (res) => {
        if (res.statusCode !== 200) {
          console.warn('[bilhete-pdf] Imagem HTTP', res.statusCode);
          res.resume();
          return resolve(null);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.on('error', (e) => {
        console.warn('[bilhete-pdf] Imagem erro:', e.message);
        resolve(null);
      });
      req.on('timeout', () => {
        console.warn('[bilhete-pdf] Imagem timeout');
        req.destroy();
        resolve(null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

export async function gerarBilhetePDF(bilhete) {
  const tipo = (bilhete.tipo || 'normal').toLowerCase();
  const cores = CORES[tipo] || CORES.normal;

  const doc = new PDFDocument({
    size: [LARGURA, ALTURA],
    margin: 0,
    info: {
      Title: `Bilhete YUYU — ${bilhete.codigo}`,
      Author: 'YUYU EVENTOS',
      Subject: bilhete.evento_nome
    }
  });

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));

  /* Fundo geral escuro */
  doc.rect(0, 0, LARGURA, ALTURA).fill(PRETO_2);

  /* ============ METADE ESQUERDA — POSTER ============ */
  const posterLargura = LARGURA / 2;
  let posterBuffer = null;
  if (bilhete.poster_url) {
    posterBuffer = await fetchImagemHttps(bilhete.poster_url);
  }

  if (posterBuffer) {
    try {
      // Desenha o poster (metade esquerda)
      doc.save();
      doc.rect(0, 0, posterLargura, ALTURA).clip();
      doc.image(posterBuffer, 0, 0, {
        fit: [posterLargura, ALTURA],
        align: 'center',
        valign: 'center'
      });
      doc.restore();

      // Fade para preto da esquerda para a direita (últimos 40% da metade esquerda)
      const inicioFade = posterLargura * 0.55;
      const passos = 40;
      for (let i = 0; i < passos; i++) {
        const t = i / passos;
        const x = inicioFade + (posterLargura - inicioFade) * t;
        const largura = (posterLargura - inicioFade) / passos + 0.5;
        const opacidade = t * t; // quadrático para fade suave
        doc.save();
        doc.fillOpacity(opacidade);
        doc.rect(x, 0, largura, ALTURA).fill(PRETO_2);
        doc.restore();
      }

      // Sombra suave na transição
      const inicioSombra = posterLargura - 30;
      for (let i = 0; i < 30; i++) {
        const x = inicioSombra + i;
        const opacidade = (i / 30) * 0.6;
        doc.save();
        doc.fillOpacity(opacidade);
        doc.rect(x, 0, 1, ALTURA).fill(PRETO_2);
        doc.restore();
      }
    } catch (e) {
      console.warn('[bilhete-pdf] Erro ao desenhar poster:', e.message);
      doc.rect(0, 0, posterLargura, ALTURA).fill(PRETO);
    }
  } else {
    // Fallback sem poster: fundo com gradiente da cor do tipo
    doc.save();
    doc.rect(0, 0, posterLargura, ALTURA).fill(cores.escuro);
    doc.restore();
  }

  /* ============ METADE DIREITA — INFO ============ */
  const infoX = posterLargura + 24;
  const infoLargura = LARGURA - infoX - 24;

  /* Faixa superior colorida */
  doc.rect(posterLargura, 0, LARGURA - posterLargura, 4).fill(cores.principal);

  /* Badge do tipo (VIP / NORMAL) */
  const tipoLabel = tipo === 'vip' ? 'VIP' : 'NORMAL';
  const badgeLargura = 68;
  const badgeX = LARGURA - 24 - badgeLargura;

  doc.roundedRect(badgeX, 22, badgeLargura, 24, 6).fill(cores.principal);
  doc.fillColor(BRANCO)
     .font('Helvetica-Bold')
     .fontSize(11)
     .text(tipoLabel, badgeX, 29, { width: badgeLargura, align: 'center' });

  /* Marca YUYU EVENTOS (canto superior esquerdo da metade direita) */
  doc.fillColor(BRANCO)
     .font('Helvetica-Bold')
     .fontSize(13)
     .text('YUYU', infoX, 26, { continued: true })
     .fillColor(cores.principal)
     .text(' EVENTOS');

  /* Linha de separação */
  doc.moveTo(infoX, 58)
     .lineTo(LARGURA - 24, 58)
     .lineWidth(1)
     .strokeColor('rgba(255,255,255,0.1)')
     .stroke();

  /* ============ NOME DO EVENTO ============ */
  let y = 74;

  doc.fillColor(BRANCO)
     .font('Helvetica-Bold')
     .fontSize(22)
     .text(bilhete.evento_nome || 'Evento', infoX, y, {
       width: infoLargura,
       align: 'left',
       lineGap: -2
     });

  y = doc.y + 14;

  /* ============ BLOCO DE INFO (DATA / LOCAL / TITULAR) ============ */
  const linhaAltura = 34;
  const iconeTam = 16;

  // Data
  if (bilhete.data_evento) {
    iconeData(doc, infoX, y + 2, iconeTam, cores.claro);
    doc.fillColor(CINZA)
       .font('Helvetica')
       .fontSize(9)
       .text('DATA', infoX + iconeTam + 10, y - 1, { characterSpacing: 1 });
    doc.fillColor(BRANCO)
       .font('Helvetica-Bold')
       .fontSize(12)
       .text(formatarData(bilhete.data_evento), infoX + iconeTam + 10, y + 10);
    y += linhaAltura;
  }

  // Local
  if (bilhete.local) {
    iconeLocal(doc, infoX, y + 2, iconeTam, cores.claro);
    doc.fillColor(CINZA)
       .font('Helvetica')
       .fontSize(9)
       .text('LOCAL', infoX + iconeTam + 10, y - 1, { characterSpacing: 1 });
    doc.fillColor(BRANCO)
       .font('Helvetica-Bold')
       .fontSize(12)
       .text(bilhete.local, infoX + iconeTam + 10, y + 10, { width: infoLargura - iconeTam - 10 });
    y += linhaAltura;
  }

  // Titular
  if (bilhete.comprador_nome) {
    iconeUser(doc, infoX, y + 2, iconeTam, cores.claro);
    doc.fillColor(CINZA)
       .font('Helvetica')
       .fontSize(9)
       .text('TITULAR', infoX + iconeTam + 10, y - 1, { characterSpacing: 1 });
    doc.fillColor(BRANCO)
       .font('Helvetica-Bold')
       .fontSize(12)
       .text(bilhete.comprador_nome, infoX + iconeTam + 10, y + 10, { width: infoLargura - iconeTam - 10 });
    y += linhaAltura;
  }

  /* ============ LINHA TRACEJADA ============ */
  y += 8;
  doc.save();
  doc.strokeColor('rgba(255,255,255,0.15)').lineWidth(1);
  doc.dash(4, { space: 3 });
  doc.moveTo(infoX, y).lineTo(LARGURA - 24, y).stroke();
  doc.undash();
  doc.restore();
  y += 14;

  /* ============ QR + BARRAS + CÓDIGO ============ */
  const qrBuffer = await gerarQRBuffer(bilhete.codigo, { width: 400 });
  const qrTamanho = 80;

  // QR à esquerda
  doc.image(qrBuffer, infoX, y, { fit: [qrTamanho, qrTamanho] });

  // Barras + código à direita do QR
  const barBuffer = await gerarBarcodeBuffer(bilhete.codigo, { scale: 2, height: 8 });
  const barX = infoX + qrTamanho + 12;
  const barLargura = infoLargura - qrTamanho - 12;

  doc.image(barBuffer, barX, y + 10, { fit: [barLargura, 30] });

  doc.fillColor(CINZA)
     .font('Helvetica')
     .fontSize(7)
     .text('CÓDIGO', barX, y + 46, { characterSpacing: 1 });

  doc.fillColor(cores.claro)
     .font('Courier-Bold')
     .fontSize(11)
     .text(bilhete.codigo, barX, y + 56, { width: barLargura, characterSpacing: 0.5 });

  /* ============ PREÇO (canto inferior direito) ============ */
  const precoY = ALTURA - 62;
  const precoTexto = `${bilhete.preco || 0} MT`;

  doc.fillColor(CINZA)
     .font('Helvetica')
     .fontSize(8)
     .text('VALOR', LARGURA - 24 - 100, precoY, {
       width: 100,
       align: 'right',
       characterSpacing: 1
     });

  doc.fillColor(cores.principal)
     .font('Helvetica-Bold')
     .fontSize(24)
     .text(precoTexto, LARGURA - 24 - 150, precoY + 10, {
       width: 150,
       align: 'right'
     });

  /* ============ RODAPÉ — EMPRESA ============ */
  doc.rect(0, ALTURA - 32, LARGURA, 32).fill(PRETO);
  doc.rect(0, ALTURA - 32, LARGURA, 2.5).fill(cores.principal);

  // Logo da empresa (se existir)
  let logoBuffer = null;
  if (bilhete.empresa_logo_url) {
    logoBuffer = await fetchImagemHttps(bilhete.empresa_logo_url);
  }

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, 24, ALTURA - 28, { fit: [44, 22] });
    } catch (_) {}
  }

  const xEmpresa = logoBuffer ? 76 : 24;

  if (bilhete.empresa_nome) {
    doc.fillColor(CINZA)
       .font('Helvetica')
       .fontSize(7)
       .text('ORGANIZADO POR', xEmpresa, ALTURA - 26, { characterSpacing: 1 });

    doc.fillColor(BRANCO)
       .font('Helvetica-Bold')
       .fontSize(11)
       .text(bilhete.empresa_nome, xEmpresa, ALTURA - 17);
  } else {
    doc.fillColor(BRANCO)
       .font('Helvetica-Bold')
       .fontSize(10)
       .text('Apresente este bilhete no dia do evento', xEmpresa, ALTURA - 20);
  }

  // Web no canto direito
  doc.fillColor('rgba(255,255,255,0.4)')
     .font('Helvetica')
     .fontSize(8)
     .text('www.yuyu-eventos.mz', LARGURA - 24 - 150, ALTURA - 20, {
       width: 150,
       align: 'right'
     });

  doc.end();

  return await new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function formatarData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const meses = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];
  return `${d.getUTCDate()} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}
