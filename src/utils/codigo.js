import crypto from 'node:crypto';

// Alfabeto sem caracteres ambíguos (0/O, 1/I/L)
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function bloco(tamanho) {
  let s = '';
  const bytes = crypto.randomBytes(tamanho);
  for (let i = 0; i < tamanho; i++) {
    s += ALFABETO[bytes[i] % ALFABETO.length];
  }
  return s;
}

export function gerarCodigoBilhete() {
  // Formato: YUYU-XXXXX-XXXXX (25 chars visíveis, alta entropia)
  return `YUYU-${bloco(5)}-${bloco(5)}`;
}
