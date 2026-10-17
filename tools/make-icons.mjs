// Gera os ícones PNG do app (sem dependências): fundo verde com um medidor branco.
// Uso: node tools/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const VERDE = [0x1f, 0x6f, 0x5c];
const BRANCO = [0xff, 0xff, 0xff];
const CLARO = [0x8f, 0xc7, 0xb8];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function bloco(tipo, dados) {
  const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
  const td = Buffer.concat([Buffer.from(tipo), dados]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function cor(x, y, t) {
  // Coordenadas normalizadas com centro em (0,0) e raio 1 na borda.
  const nx = (x + 0.5) / t * 2 - 1, ny = (y + 0.5) / t * 2 - 1;
  const r = Math.sqrt(nx * nx + ny * ny);
  // Anel de medidor (raio 0.42 a 0.56), preenchido em 3/4 a partir do topo, sentido horário.
  if (r > 0.42 && r < 0.56) {
    let ang = Math.atan2(nx, -ny); // 0 no topo
    if (ang < 0) ang += 2 * Math.PI;
    return ang < Math.PI * 1.5 ? BRANCO : CLARO;
  }
  if (r < 0.14) return BRANCO;
  return VERDE;
}

function png(t) {
  const linhas = [];
  for (let y = 0; y < t; y++) {
    const l = Buffer.alloc(1 + t * 3);
    for (let x = 0; x < t; x++) {
      const c = cor(x, y, t);
      l[1 + x * 3] = c[0]; l[2 + x * 3] = c[1]; l[3 + x * 3] = c[2];
    }
    linhas.push(l);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(t, 0); ihdr.writeUInt32BE(t, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(Buffer.concat(linhas))),
    bloco('IEND', Buffer.alloc(0))
  ]);
}

for (const t of [192, 512]) writeFileSync(new URL('../icons/icon-' + t + '.png', import.meta.url), png(t));
console.log('Ícones gerados em icons/.');
