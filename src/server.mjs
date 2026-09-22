import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPacket, packetToMarkdown } from './core.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const port = Number(process.env.PORT || 4177);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/generate') {
    let body = ''; for await (const chunk of req) body += chunk; try { const input = JSON.parse(body); const packet = buildPacket(input); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ packet, markdown: packetToMarkdown(packet) })); } catch (e) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); } return;
  }
  const requested = req.url === '/' ? '/public/index.html' : req.url; const file = path.resolve(root, `.${requested}`);
  if (!file.startsWith(root) || !file.includes(`${path.sep}public${path.sep}`)) { res.writeHead(404); return res.end('Not found'); }
  try { res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }); res.end(await readFile(file)); } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('error', error => { console.error(`Unable to start local server: ${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Evidence Packet is running at http://127.0.0.1:${port}`));
