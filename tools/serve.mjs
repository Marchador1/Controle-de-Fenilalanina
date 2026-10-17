// Servidor estático local para testar o app (sem dependências).
// Uso: node tools/serve.mjs [porta]  →  http://localhost:8080
// No celular da mesma rede, use o IP do PC; a instalação/offline exige https ou localhost.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const porta = Number(process.argv[2]) || 8080;
const tipos = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png'
};

createServer(async function (req, res) {
  let caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (caminho.endsWith('/')) caminho += 'index.html';
  const arquivo = normalize(join(raiz, caminho));
  if (!arquivo.startsWith(normalize(raiz)) || arquivo.split(sep).includes('.git')) {
    res.writeHead(403); res.end(); return;
  }
  try {
    const dados = await readFile(arquivo);
    res.writeHead(200, { 'Content-Type': tipos[extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(dados);
  } catch {
    res.writeHead(404); res.end('Não encontrado');
  }
}).listen(porta, function () {
  console.log('App em http://localhost:' + porta);
});
