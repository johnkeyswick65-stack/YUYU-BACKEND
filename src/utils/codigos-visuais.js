import QRCode from 'qrcode';
import bwipjs from 'bwip-js';

/* ============================================================
   Gera QR code PNG (buffer)
   conteúdo: normalmente o código do bilhete (YUYU-XXXXX-XXXXX)
   ============================================================ */
export async function gerarQRBuffer(texto, opcoes = {}) {
  return QRCode.toBuffer(texto, {
    type: 'png',
    errorCorrectionLevel: 'H',   // alta resistência a danos
    margin: 2,
    width: opcoes.width || 600,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });
}

/* ============================================================
   Gera código de barras Code128 PNG (buffer)
   ============================================================ */
export async function gerarBarcodeBuffer(texto, opcoes = {}) {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text: texto,
    scale: opcoes.scale || 3,
    height: opcoes.height || 12,
    includetext: true,
    textxalign: 'center',
    textsize: 10,
    paddingwidth: 4,
    paddingheight: 4,
    backgroundcolor: 'FFFFFF'
  });
}
