import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const projectBase = '/zattoomilaa';
const customDomain = 'https://zattoo.run';

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(full));
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

for (const file of await htmlFiles(root)) {
  let html = await readFile(file, 'utf8');
  html = html
    .replaceAll(`href="${projectBase}/`, 'href="/')
    .replaceAll(`src="${projectBase}/`, 'src="/')
    .replaceAll(`"${projectBase}/assets/`, '"/assets/')
    .replaceAll(`"${projectBase}/__l5e/`, '"/__l5e/')
    .replaceAll(`src:"${projectBase}/assets/`, 'src:"/assets/')
    .replaceAll(`src:"${projectBase}/__l5e/`, 'src:"/__l5e/')
    .replaceAll('https://dellmodrun.github.io/zattoomilaa/', `${customDomain}/`);
  await writeFile(file, html);
}

const bundlePath = path.join(root, 'assets', 'index-Bu1onIBs.js');
let bundle = await readFile(bundlePath, 'utf8');
bundle = bundle
  .replace(`e.update({basepath:\`${projectBase}\`,`, 'e.update({basepath:``,' )
  .replace(`href:\`${projectBase}/favicon.png\``, 'href:`/favicon.png`')
  .replace(`N_=function(e){return\`${projectBase}/\`+e}`, 'N_=function(e){return`/`+e}')
  .replace(`$g=\`${projectBase}/assets/styles-CR_D-fOd.css\``, '$g=`/assets/styles-CR_D-fOd.css`');
if (!bundle.includes('e.update({basepath:``,')) {
  throw new Error('TanStack Router hydration basepath was not found.');
}
if (!bundle.includes('N_=function(e){return`/`+e}')) {
  throw new Error('Dynamic asset base path was not updated.');
}
await writeFile(bundlePath, bundle);

const routePath = path.join(root, 'assets', 'routes-DElrTq2H.js');
let route = await readFile(routePath, 'utf8');
route = route.replaceAll(`url:\`${projectBase}/__l5e/`, 'url:`/__l5e/');
await writeFile(routePath, route);

console.log('Custom-domain root paths applied.');
