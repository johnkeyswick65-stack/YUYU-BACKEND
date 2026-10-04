import PDFDocument from 'pdfkit';
import { gerarQRBuffer, gerarBarcodeBuffer } from './codigos-visuais.js';

/* Formato A5 vertical: 148 x 210 mm → em pontos PDF: 419.5 x 595.3 */
const LARGURA = 419.5;
const ALTURA = 595.3;

const VERMELHO = '#dc2626';
const VERMELHO_ESCURO = '#7f1d1d';
const PRETO = '#0a0a0a';
const CINZA = '#666666';
const CINZA_CLARO = '#f4f4f4';
const CINZA_LINHA = '#cccccc';

/* Desenha uma linha tracejada horizontal */
function linhaTracejada(doc, y, x1 = 24, x2 = LARGURA - 24) {
  doc.save();
  doc.strokeColor(CINZA_LINHA).lineWidth(1);
  doc.dash(4, { space: 3 });
  doc.moveTo(x1, y).lineTo(x2, y).stroke();
  doc.undash();
  doc.restore();
}

/* Converte ArrayBuffer/Buffer para Buffer */
function toBuffer(data) {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  return null;
}

async function fetchImagem(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return toBuffer(Buffer.from(ab));
  } catch (_) {
    return null;
  }
}

export async function gerarBilhetePDF(bilhete) {
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

  /* ---------- Cabeçalho ---------- */
  doc.rect(0, 0, LARGURA, 70).fill(PRETO);
  doc.rect(0, 70, LARGURA, 4).fill(VERMELHO);

  // Logo da empresa (se existir) — canto esquerdo do cabeçalho
  let logoBuffer = null;
  if (bilhete.empresa_logo_url) {
    logoBuffer = await fetchImagem(bilhete.empresa_logo_url);
  }

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, 24, 14, { fit: [50, 42] });
    } catch (_) {}
  }

  // Nome YUYU EVENTOS — deslocado para a direita se houver logo
  const xMarca = logoBuffer ? 84 : 24;

  doc.fillColor('#ffffff')
     .font('Helvetica-Bold')
     .fontSize(20)
     .text('YUYU', xMarca, 20, { continued: true })
     .fillColor(VERMELHO)
     .text(' EVENTOS');

  doc.fillColor('#ffffff')
     .font('Helvetica')
     .fontSize(8)
     .text('Bilhete oficial', xMarca, 46);

  // Tipo (Normal/VIP) no canto direito
  const tipoLabel = (bilhete.tipo || 'normal').toUpperCase();
  const tipoLargura = 58;

  doc.roundedRect(LARGURA - 24 - tipoLargura, 24, tipoLargura, 22, 6).fill(VERMELHO);

  doc.fillColor('#ffffff')
     .font('Helvetica-Bold')
     .fontSize(11)
     .text(tipoLabel, LARGURA - 24 - tipoLargura, 29, {
       width: tipoLargura,
       align: 'center'
     });

  /* ---------- Nome do evento ---------- */
  let y = 100;

  doc.fillColor(PRETO)
     .font('Helvetica-Bold')
     .fontSize(18)
     .text(bilhete.evento_nome || 'Evento', 24, y, {
       width: LARGURA - 48,
       align: 'left'
     });

  y = doc.y + 6;

  doc.fillColor(CINZA)
     .font('Helvetica')
     .fontSize(10)
     .text(formatarData(bilhete.data_evento), 24, y);

  y = doc.y + 2;

  doc.fillColor(CINZA)
     .text(bilhete.local || '', 24, y);

  /* ---------- Linha tracejada ---------- */
  y = doc.y + 14;
  linhaTracejada(doc, y);
  y += 14;

  /* ---------- Área QR + barras ---------- */
  doc.roundedRect(24, y, LARGURA - 48, 220, 12).fill(CINZA_CLARO);

  const qrBuffer = await gerarQRBuffer(bilhete.codigo, { width: 500 });
  const qrTamanho = 130;
  const qrX = (LARGURA - qrTamanho) / 2;

  doc.image(qrBuffer, qrX, y + 16, { fit: [qrTamanho, qrTamanho] });

  const barBuffer = await gerarBarcodeBuffer(bilhete.codigo, { scale: 3, height: 10 });
  const barLargura = LARGURA - 96;
  const barY = y + 16 + qrTamanho + 12;

  doc.image(barBuffer, 48, barY, {
    fit: [barLargura, 40],
    align: 'center'
  });

  /* ---------- Código legível ---------- */
  y += 220 + 14;

  doc.fillColor(CINZA)
     .font('Helvetica')
     .fontSize(8)
     .text('CÓDIGO DO BILHETE', 24, y, { width: LARGURA - 48, align: 'center' });

  y = doc.y + 4;

  doc.fillColor(PRETO)
     .font('Courier-Bold')
     .fontSize(15)
     .text(bilhete.codigo, 24, y, {
       width: LARGURA - 48,
       align: 'center',
       characterSpacing: 1
     });

  /* ---------- Linha tracejada ---------- */
  y = doc.y + 16;
  linhaTracejada(doc, y);
  y += 14;

  /* ---------- Dados do portador ---------- */
  if (bilhete.comprador_nome) {
    doc.fillColor(CINZA)
       .font('Helvetica')
       .fontSize(8)
       .text('TITULAR', 24, y);

    doc.fillColor(PRETO)
       .font('Helvetica-Bold')
       .fontSize(12)
       .text(bilhete.comprador_nome, 24, doc.y + 2);
  }

  /* ---------- Preço ---------- */
  const precoY = ALTURA - 90;

  doc.fillColor(CINZA)
     .font('Helvetica')
     .fontSize(8)
     .text('VALOR', 24, precoY);

  doc.fillColor(VERMELHO)
     .font('Helvetica-Bold')
     .fontSize(22)
     .text(`${bilhete.preco || 0} MT`, 24, precoY + 12);

  /* ---------- Rodapé ---------- */
  doc.rect(0, ALTURA - 40, LARGURA, 40).fill(PRETO);
  doc.rect(0, ALTURA - 40, LARGURA, 3).fill(VERMELHO);

  // Nome da empresa (se existir) — mais destacado
  const rodapeTexto = bilhete.empresa_nome
    ? `Organizado por ${bilhete.empresa_nome}`
    : 'Apresente este bilhete no dia do evento';

  doc.fillColor('#ffffff')
     .font(bilhete.empresa_nome ? 'Helvetica-Bold' : 'Helvetica')
     .fontSize(9)
     .text(rodapeTexto, 24, ALTURA - 28, {
       width: LARGURA - 48,
       align: 'center'
     });

  // Pequeno crédito em baixo
  doc.fillColor('#888888')
     .font('Helvetica')
     .fontSize(7)
     .text('www.yuyu-eventos.mz', 24, ALTURA - 14, {
       width: LARGURA - 48,
       align: 'center'
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
