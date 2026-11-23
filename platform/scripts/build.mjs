import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { build } from 'esbuild';
const assets = {};
for (const [route, file, contentType] of [
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/app.js', 'app.js', 'text/javascript; charset=utf-8'],
  ['/styles.css', 'styles.css', 'text/css; charset=utf-8']
]) assets[route] = {body:await readFile(`ui/${file}`, 'utf8'), contentType};
await mkdir('.generated', {recursive:true});
await writeFile('.generated/assets.mjs', `export const ASSETS = ${JSON.stringify(assets)};\n`);
await rm('dist', {recursive:true,force:true});
await mkdir('dist/server', {recursive:true});
await build({entryPoints:['src/worker.mjs'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'none'});
await mkdir('dist/.openai', {recursive:true});
await cp('.openai/hosting.json','dist/.openai/hosting.json');
await cp('drizzle','dist/drizzle',{recursive:true});
const manifest=JSON.parse(await readFile('.openai/hosting.json','utf8'));
if(!manifest.project_id || !manifest.d1 || !manifest.capabilities?.includes('mcp')) throw new Error('Incomplete hosting manifest');
console.log('Built Worker, UI assets, hosting metadata and D1 migrations.');
