import PDFDocument from 'pdfkit';
import https from 'node:https';
import { gerarQRBuffer, gerarBarcodeBuffer } from './codigos-visuais.js';

/* A5 landscape: 210 x 148 mm */
const LARGURA = 595.3;
const ALTURA = 419.5;

const CORES = {
  vip: { principal: '#dc2626', escuro: '#7f1d1d', claro: '#fca5a5' },
  normal: { principal: '#2563eb', escuro: '#1e3a8a', claro: '#93c5fd' }
};

const PRETO = '#0a0a0a';
const PRETO_2 = '#141418';
const CINZA = '#888888';
const BRANCO = '#ffffff';

/* Ícones */
function iconeData(doc, x, y, tam, cor) {
  doc.save();
  doc.strokeColor(cor).lineWidth(1.8).lineCap('round').lineJoin('round');
  const w = tam, h = tam * 0.85, r = 2.5;
  doc.roundedRect(x, y + tam * 0.15, w, h, r).stroke();
  doc.moveTo(x, y + tam * 0.15 + h * 0.3).lineTo(x + w, y + tam * 0.15 + h * 0.3).stroke();
  doc.moveTo(x + w * 0.28, y).lineTo(x + w * 0.28, y + tam * 0.25).stroke();
  doc.moveTo(x + w * 0.72, y).lineTo(x + w * 0.72, y + tam * 0.25).stroke();
  doc.restore();
}

function iconeLocal(doc, x, y, tam, cor) {
  doc.save();
  doc.fillColor(cor).strokeColor(cor).lineWidth(1.8).lineCap('round').lineJoin('round');
  const cx = x + tam / 2, cy = y + tam * 0.42, r = tam * 0.3;
  doc.circle(cx, cy, r).stroke();
  doc.moveTo(cx - r * 0.75, cy + r * 0.75)
     .lineTo(cx, y + tam * 1.05)
     .lineTo(cx + r * 0.75, cy + r * 0.75)
     .stroke();
  doc.circle(cx, cy, r * 0.35).fill();
  doc.restore();
}

function iconeUser(doc, x, y, tam, cor) {
  doc.save();
  doc.strokeColor(cor).lineWidth(1.8).lineCap('round').lineJoin('round');
  const cx = x + tam / 2;
  doc.circle(cx, y + tam * 0.3, tam * 0.22).stroke();
  doc.moveTo(x + tam * 0.12, y + tam * 0.98)
     .lineTo(x + tam * 0.12, y + tam * 0.78)
     .quadraticCurveTo(x + tam * 0.12, y + tam * 0.58, cx, y + tam * 0.58)
     .quadraticCurveTo(x + tam * 0.88, y + tam * 0.58, x + tam * 0.88, y + tam * 0.78)
     .lineTo(x + tam * 0.88, y + tam * 0.98)
     .stroke();
  doc.restore();
}

/* Fetch de imagem */
function fetchImagemHttps(url, profundidade = 0) {
  return new Promise((resolve) => {
    if (profundidade > 5) return resolve(null);
    try {
      const urlObj = new URL(url);
      const opts = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        timeout: 30000,
        headers: { 'User-Agent': 'YUYU-Eventos-PDF/1.0' }
      };
      const req = https.get(opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const novaUrl = new URL(res.headers.location, url).toString();
          return fetchImagemHttps(novaUrl, profundidade + 1).then(resolve);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          console.log('[bilhete-pdf] Imagem OK:', Buffer.concat(chunks).length, 'bytes');
          resolve(Buffer.concat(chunks));
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    } catch (_) { resolve(null); }
  });
}

/* ============ PÁGINA 1 — BILHETE PRINCIPAL ============ */
async function desenharBilhetePrincipal(doc, bilhete, cores) {
  doc.rect(0, 0, LARGURA, ALTURA).fill(PRETO_2);

  const posterLargura = LARGURA / 2;

  /* Poster */
  let posterBuffer = null;
  if (bilhete.poster_url) {
    posterBuffer = await fetchImagemHttps(bilhete.poster_url);
  }

  if (posterBuffer) {
    try {
      doc.save();
      doc.rect(0, 0, posterLargura, ALTURA).clip();
      doc.image(posterBuffer, 0, 0, {
        fit: [posterLargura, ALTURA],
        align: 'center',
        valign: 'center'
      });
      doc.restore();
    } catch (_) {
      doc.rect(0, 0, posterLargura, ALTURA).fill(PRETO);
    }
  } else {
    doc.rect(0, 0, posterLargura, ALTURA).fill(cores.escuro);
  }

  /* Fade horizontal */
  const inicioFade = posterLargura * 0.35;
  const passos = 20;
  const larguraTotal = posterLargura - inicioFade;
  const larguraBanda = (larguraTotal / passos) * 2;
  for (let i = 0; i < passos; i++) {
    const t = i / (passos - 1);
    const x = inicioFade + (larguraTotal * i / passos);
    const opacidade = Math.pow(t, 1.5);
    doc.save();
    doc.fillOpacity(opacidade);
    doc.rect(x, 0, larguraBanda, ALTURA).fill(PRETO_2);
    doc.restore();
  }
  doc.save();
  doc.fillOpacity(1);
  doc.rect(posterLargura - 6, 0, 6, ALTURA).fill(PRETO_2);
  doc.restore();

  /* Fade vertical no poster */
  const alturaFadeLogo = 130;
  for (let i = 0; i < alturaFadeLogo; i++) {
    const y = ALTURA - alturaFadeLogo + i;
    const t = i / alturaFadeLogo;
    const opacidade = Math.pow(t, 1.6) * 0.92;
    doc.save();
    doc.fillOpacity(opacidade);
    doc.rect(0, y, posterLargura, 1).fill('#000000');
    doc.restore();
  }

  /* Logo + empresa sobre o poster */
  let logoBuffer = null;
  if (bilhete.empresa_logo_url) {
    logoBuffer = await fetchImagemHttps(bilhete.empresa_logo_url);
  }

  const logoBoxTam = 52;
  const logoX = 24;
  const logoY = ALTURA - logoBoxTam - 24;

  if (logoBuffer) {
    try {
      doc.save();
      doc.roundedRect(logoX, logoY, logoBoxTam, logoBoxTam, 8).fill('#ffffff');
      doc.restore();
      doc.save();
      doc.roundedRect(logoX + 3, logoY + 3, logoBoxTam - 6, logoBoxTam - 6, 6).clip();
      doc.image(logoBuffer, logoX + 3, logoY + 3, {
        fit: [logoBoxTam - 6, logoBoxTam - 6],
        align: 'center',
        valign: 'center'
      });
      doc.restore();
    } catch (_) {}
  }

  const xEmpresa = logoBuffer ? logoX + logoBoxTam + 14 : logoX;
  const yEmpresa = logoBuffer ? logoY + 8 : ALTURA - 60;

  if (bilhete.empresa_nome) {
    doc.fillColor(CINZA).font('Helvetica').fontSize(8)
       .text('ORGANIZADO POR', xEmpresa, yEmpresa, { characterSpacing: 1 });
    doc.fillColor(BRANCO).font('Helvetica-Bold').fontSize(15)
       .text(bilhete.empresa_nome, xEmpresa, yEmpresa + 14, {
         width: posterLargura - xEmpresa - 24,
         lineGap: -2
       });
  }

  /* Lado direito */
  const infoX = posterLargura + 24;
  const infoLargura = LARGURA - infoX - 24;

  doc.rect(posterLargura, 0, LARGURA - posterLargura, 4).fill(cores.principal);

  const tipoLabel = (bilhete.tipo || 'normal').toUpperCase() === 'VIP' ? 'VIP' : 'NORMAL';
  const badgeLargura = 68;
  const badgeX = LARGURA - 24 - badgeLargura;
  doc.roundedRect(badgeX, 22, badgeLargura, 24, 6).fill(cores.principal);
  doc.fillColor(BRANCO).font('Helvetica-Bold').fontSize(11)
     .text(tipoLabel, badgeX, 29, { width: badgeLargura, align: 'center' });

  doc.fillColor(BRANCO).font('Helvetica-Bold').fontSize(13)
     .text('YUYU', infoX, 26, { continued: true })
     .fillColor(cores.principal).text(' EVENTOS');

  doc.moveTo(infoX, 58).lineTo(LARGURA - 24, 58)
     .lineWidth(1).strokeColor('rgba(255,255,255,0.1)').stroke();

  let y = 74;
  doc.fillColor(BRANCO).font('Helvetica-Bold').fontSize(22)
     .text(bilhete.evento_nome || 'Evento', infoX, y, {
       width: infoLargura, align: 'left', lineGap: -2
     });
  y = doc.y + 14;

  const linhaAltura = 34;
  const iconeTam = 16;

  if (bilhete.data_evento) {
    iconeData(doc, infoX, y + 2, iconeTam, cores.claro);
    doc.fillColor(CINZA).font('Helvetica').fontSize(9)
       .text('DATA', infoX + iconeTam + 10, y - 1, { characterSpacing: 1 });
    doc.fillColor(BRANCO).font('Helvetica-Bold').fontSize(12)
       .text(formatarData(bilhete.data_evento), infoX + iconeTam + 10, y + 10);
    y += linhaAltura;
  }
  if (bilhete.local) {
    iconeLocal(doc, infoX, y + 2, iconeTam, cores.claro);
    doc.fillColor(CINZA).font('Helvetica').fontSize(9)
       .text('LOCAL', infoX + iconeTam + 10, y - 1, { characterSpacing: 1 });
    doc.fillColor(BRANCO).font('Helvetica-Bold').fontSize(12)
       .text(bilhete.local, infoX + iconeTam + 10, y + 10, { width: infoLargura - iconeTam - 10 });
    y += linhaAltura;
  }
  if (bilhete.comprador_nome) {
    iconeUser(doc, infoX, y + 2, iconeTam, cores.claro);
    doc.fillColor(CINZA).font('Helvetica').fontSize(9)
       .text('TITULAR', infoX + iconeTam + 10, y - 1, { characterSpacing: 1 });
    doc.fillColor(BRANCO).font('Helvetica-Bold').fontSize(12)
       .text(bilhete.comprador_nome, infoX + iconeTam + 10, y + 10, { width: infoLargura - iconeTam - 10 });
    y += linhaAltura;
  }

  y += 8;
  doc.save();
  doc.strokeColor('rgba(255,255,255,0.15)').lineWidth(1);
  doc.dash(4, { space: 3 });
  doc.moveTo(infoX, y).lineTo(LARGURA - 24, y).stroke();
  doc.undash();
  doc.restore();
  y += 14;

  /* QR + barras */
  const qrBuffer = await gerarQRBuffer(bilhete.codigo, { width: 400 });
  const qrTamanho = 80;
  doc.image(qrBuffer, infoX, y, { fit: [qrTamanho, qrTamanho] });

  const barBuffer = await gerarBarcodeBuffer(bilhete.codigo, { scale: 2, height: 8 });
  const barX = infoX + qrTamanho + 12;
  const barLargura = infoLargura - qrTamanho - 12;
  doc.image(barBuffer, barX, y + 10, { fit: [barLargura, 30] });

  doc.fillColor(CINZA).font('Helvetica').fontSize(7)
     .text('CÓDIGO', barX, y + 46, { characterSpacing: 1 });
  doc.fillColor(cores.claro).font('Courier-Bold').fontSize(11)
     .text(bilhete.codigo, barX, y + 56, { width: barLargura, characterSpacing: 0.5 });

  /* Preço */
  const precoY = ALTURA - 62;
  doc.fillColor(CINZA).font('Helvetica').fontSize(8)
     .text('VALOR', LARGURA - 24 - 100, precoY, {
       width: 100, align: 'right', characterSpacing: 1
     });
  doc.fillColor(cores.principal).font('Helvetica-Bold').fontSize(24)
     .text(`${bilhete.preco || 0} MT`, LARGURA - 24 - 150, precoY + 10, {
       width: 150, align: 'right'
     });
  doc.fillColor('rgba(255,255,255,0.35)').font('Helvetica').fontSize(8)
     .text('www.yuyu-eventos.mz', LARGURA - 24 - 150, ALTURA - 18, {
       width: 150, align: 'right'
     });
}

/* ============ PÁGINA 2 — QR CODE GIGANTE ============ */
async function desenharPaginaQR(doc, bilhete, cores) {
  doc.addPage({ size: [LARGURA, ALTURA], margin: 0 });

  doc.rect(0, 0, LARGURA, ALTURA).fill(PRETO_2);

  // Faixa colorida no topo
  doc.rect(0, 0, LARGURA, 5).fill(cores.principal);

  // Cabeçalho
  doc.fillColor(BRANCO).font('Helvetica-Bold').fontSize(16)
     .text('YUYU', 40, 30, { continued: true })
     .fillColor(cores.principal).text(' EVENTOS');

  doc.fillColor(CINZA).font('Helvetica').fontSize(11)
     .text('Apresente este QR no dia do evento', 40, 54);

  // Nome do evento
  doc.fillColor(BRANCO).font('Helvetica-Bold').fontSize(20)
     .text(bilhete.evento_nome || 'Evento', 40, 80, { width: LARGURA - 80 });

  // QR centrado, grande
  const qrBuffer = await gerarQRBuffer(bilhete.codigo, { width: 800 });
  const qrTamanho = 220;
  const qrX = (LARGURA - qrTamanho) / 2;
  const qrY = 130;

  // Fundo branco com cantos arredondados
  doc.save();
  doc.roundedRect(qrX - 20, qrY - 20, qrTamanho + 40, qrTamanho + 40, 16).fill('#ffffff');
  doc.restore();

  doc.image(qrBuffer, qrX, qrY, { fit: [qrTamanho, qrTamanho] });

  // Código por baixo
  doc.fillColor(CINZA).font('Helvetica').fontSize(9)
     .text('CÓDIGO', 0, ALTURA - 55, { width: LARGURA, align: 'center', characterSpacing: 1 });
  doc.fillColor(cores.claro).font('Courier-Bold').fontSize(16)
     .text(bilhete.codigo, 0, ALTURA - 40, { width: LARGURA, align: 'center', characterSpacing: 1 });
}

/* ============ PÁGINA 3 — CÓDIGO DE BARRAS GIGANTE ============ */
async function desenharPaginaBarcode(doc, bilhete, cores) {
  doc.addPage({ size: [LARGURA, ALTURA], margin: 0 });

  doc.rect(0, 0, LARGURA, ALTURA).fill('#ffffff');

  // Faixa colorida no topo
  doc.rect(0, 0, LARGURA, 5).fill(cores.principal);

  // Cabeçalho
  doc.fillColor(PRETO).font('Helvetica-Bold').fontSize(16)
     .text('YUYU', 40, 30, { continued: true })
     .fillColor(cores.principal).text(' EVENTOS');

  doc.fillColor(CINZA).font('Helvetica').fontSize(11)
     .text('Apresente este código de barras no dia do evento', 40, 54);

  // Nome do evento
  doc.fillColor(PRETO).font('Helvetica-Bold').fontSize(20)
     .text(bilhete.evento_nome || 'Evento', 40, 80, { width: LARGURA - 80 });

  // Tipo
  const tipoLabel = (bilhete.tipo || 'normal').toUpperCase() === 'VIP' ? 'VIP' : 'NORMAL';
  doc.fillColor(cores.principal).font('Helvetica-Bold').fontSize(14)
     .text(tipoLabel, 40, 110);

  // Código de barras gigante
  const barBuffer = await gerarBarcodeBuffer(bilhete.codigo, { scale: 6, height: 14 });
  const barLargura = LARGURA - 80;
  const barY = 170;

  // Fundo branco levemente cinza
  doc.save();
  doc.roundedRect(40, barY - 20, barLargura, 180, 16).fill('#f7f7f7');
  doc.restore();

  doc.image(barBuffer, 60, barY, { fit: [barLargura - 40, 130] });

  // Código por baixo em grande
  doc.fillColor(PRETO).font('Courier-Bold').fontSize(20)
     .text(bilhete.codigo, 0, ALTURA - 90, {
       width: LARGURA, align: 'center', characterSpacing: 2
     });

  // Rodapé com empresa
  if (bilhete.empresa_nome) {
    doc.fillColor(CINZA).font('Helvetica').fontSize(9)
       .text('Organizado por ' + bilhete.empresa_nome, 0, ALTURA - 45, {
         width: LARGURA, align: 'center'
       });
  }

  doc.fillColor(CINZA).font('Helvetica').fontSize(8)
     .text('www.yuyu-eventos.mz', 0, ALTURA - 25, {
       width: LARGURA, align: 'center'
     });
}

export async function gerarBilhetePDF(bilhete) {
  const tipo = (bilhete.tipo || 'normal').toLowerCase();
  const cores = CORES[tipo] || CORES.normal;

  const doc = new PDFDocument({
    size: [LARGURA, ALTURA],
    margin: 0,
    autoFirstPage: false,
    info: {
      Title: `Bilhete YUYU — ${bilhete.codigo}`,
      Author: 'YUYU EVENTOS',
      Subject: bilhete.evento_nome
    }
  });

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));

  /* Página 1 */
  doc.addPage({ size: [LARGURA, ALTURA], margin: 0 });
  await desenharBilhetePrincipal(doc, bilhete, cores);

  /* Página 2 — QR gigante */
  await desenharPaginaQR(doc, bilhete, cores);

  /* Página 3 — Barcode gigante */
  await desenharPaginaBarcode(doc, bilhete, cores);

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
