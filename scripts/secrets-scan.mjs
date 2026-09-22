import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'); const ignored=new Set(['node_modules','.git','out']); const findings=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(ignored.has(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else {const t=await readFile(p,'utf8');if(/(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/.test(t))findings.push(path.relative(root,p));}}} await walk(root);if(findings.length){console.error(`Potential secrets: ${findings.join(', ')}`);process.exitCode=1}else console.log('Secrets scan passed.');
