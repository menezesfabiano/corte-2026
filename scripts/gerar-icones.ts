/**
 * Gera os icones do PWA a partir do desenho da v1 (barra de anilhas branca em fundo
 * vermelho), sem biblioteca de imagem. So retangulos, entao um encoder PNG de
 * 30 linhas com o zlib do proprio Node resolve.
 *
 * Rode com: npm run icones
 */
import { crc32, deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PASTA = resolve(RAIZ, "public/icons");

const VERMELHO: [number, number, number] = [0xc8, 0x10, 0x2e];
const BRANCO: [number, number, number] = [0xff, 0xff, 0xff];

/** Retangulos do desenho original, numa grade de 32 por 32: [x, y, largura, altura]. */
const BARRA: [number, number, number, number][] = [
  [4, 14, 24, 4],
  [6, 8, 5, 16],
  [21, 8, 5, 16],
  [2, 11, 2, 10],
  [28, 11, 2, 10],
];

function chunk(tipo: string, dados: Buffer): Buffer {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length, 0);
  const nome = Buffer.from(tipo, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([nome, dados])) >>> 0, 0);
  return Buffer.concat([tamanho, nome, dados, crc]);
}

function png(tamanho: number, pixels: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // RGB
  const linha = tamanho * 3;
  const cru = Buffer.alloc((linha + 1) * tamanho);
  for (let y = 0; y < tamanho; y += 1) {
    cru[y * (linha + 1)] = 0; // filtro nenhum
    pixels.copy(cru, y * (linha + 1) + 1, y * linha, (y + 1) * linha);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(cru, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Desenha o icone. Em modo maskable o desenho fica dentro da zona segura central. */
function desenhar(tamanho: number, maskable: boolean): Buffer {
  const pixels = Buffer.alloc(tamanho * tamanho * 3);
  for (let i = 0; i < tamanho * tamanho; i += 1) pixels.set(VERMELHO, i * 3);

  const escala = (tamanho / 32) * (maskable ? 0.72 : 1);
  const deslocamento = (tamanho - 32 * escala) / 2;
  for (const [x, y, w, h] of BARRA) {
    const x0 = Math.round(deslocamento + x * escala);
    const y0 = Math.round(deslocamento + y * escala);
    const x1 = Math.round(deslocamento + (x + w) * escala);
    const y1 = Math.round(deslocamento + (y + h) * escala);
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) pixels.set(BRANCO, (py * tamanho + px) * 3);
    }
  }
  return png(tamanho, pixels);
}

mkdirSync(PASTA, { recursive: true });
const saidas: [string, number, boolean][] = [
  ["icone-192.png", 192, false],
  ["icone-512.png", 512, false],
  ["icone-512-maskable.png", 512, true],
  ["apple-touch-icon.png", 180, false],
];
for (const [nome, tamanho, maskable] of saidas) {
  const arquivo = desenhar(tamanho, maskable);
  writeFileSync(resolve(PASTA, nome), arquivo);
  console.log(`${nome.padEnd(24)} ${tamanho}x${tamanho}  ${arquivo.length} bytes`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#C8102E"/><g fill="#fff">${BARRA.map(
  ([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`,
).join("")}</g></svg>\n`;
writeFileSync(resolve(PASTA, "favicon.svg"), svg);
console.log("favicon.svg");
