#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildPacket, packetToMarkdown } from './core.mjs';

function usage() { console.log(`Evidence Packet v1\n\nUsage:\n  evidence-packet generate --answer answer.txt --source TITLE:path/to/source.md [--source TITLE:path] --out out\n\nSupported source files: .txt, .md, .html, .htm\nMissing source paths are retained as unresolved items.`); }
function extFormat(file) { const ext = path.extname(file).toLowerCase(); if (!['.txt', '.md', '.html', '.htm'].includes(ext)) throw new Error(`Unsupported source format: ${file}`); return ext === '.html' || ext === '.htm' ? 'html' : ext.slice(1); }
async function main() {
  const args = process.argv.slice(2); if (args[0] !== 'generate' || args.includes('--help')) return usage();
  const get = key => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] : null; };
  const answerPath = get('--answer'); const out = get('--out') || 'out';
  if (!answerPath) throw new Error('--answer is required');
  const answerText = await readFile(answerPath, 'utf8'); const sources = [];
  for (let i = 0; i < args.length; i++) if (args[i] === '--source') {
    const raw = args[++i]; if (!raw) throw new Error('--source needs TITLE:path'); const divider = raw.indexOf(':');
    const title = divider === -1 ? path.basename(raw) : raw.slice(0, divider); const file = divider === -1 ? raw : raw.slice(divider + 1);
    try { sources.push({ source_id: `SOURCE_${String(sources.length + 1).padStart(2, '0')}`, title, original_name: path.basename(file), format: extFormat(file), content: await readFile(file, 'utf8') }); }
    catch (error) { sources.push({ source_id: `SOURCE_${String(sources.length + 1).padStart(2, '0')}`, title, original_name: path.basename(file), content: null, format: 'unknown' }); }
  }
  if (!sources.length) throw new Error('At least one --source is required');
  const packet = buildPacket({ answerText, answerReference: answerPath, sources }); await mkdir(out, { recursive: true });
  await writeFile(path.join(out, 'evidence-packet.json'), JSON.stringify(packet, null, 2) + '\n'); await writeFile(path.join(out, 'evidence-packet.md'), packetToMarkdown(packet));
  console.log(`Generated ${packet.packet_id}\nJSON: ${path.join(out, 'evidence-packet.json')}\nMarkdown: ${path.join(out, 'evidence-packet.md')}\nValidation: ${packet.validation.valid ? 'valid' : packet.validation.errors.join('; ')}`);
}
main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
