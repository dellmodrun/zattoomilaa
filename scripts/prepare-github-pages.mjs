import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = '/zattoomilaa';

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
    .replace(/href="\/(?!zattoomilaa(?:\/|"))/g, `href="${base}/`)
    .replace(/src="\/(?!zattoomilaa(?:\/|"))/g, `src="${base}/`)
    .replace(/"\/(assets|__l5e)\//g, `"${base}/$1/`)
    .replace(/src:"\/(assets|__l5e)\//g, `src:"${base}/$1/`)
    .replace(/<script defer src="\/zattoomilaa\/~flock\.js"[^>]*><\/script>/g, '')
    .replace(/<script defer src="\/zattoomilaa\/__l5e\/events\.[^"]+"[^>]*><\/script>/g, '');
  await writeFile(file, html);
}

const bundlePath = path.join(root, 'assets', 'index-Bu1onIBs.js');
let bundle = await readFile(bundlePath, 'utf8');
const hydrationNeedle = 'e.update({basepath:``,';
if (bundle.includes(hydrationNeedle)) {
  bundle = bundle.replace(hydrationNeedle, `e.update({basepath:\`${base}\`,`);
} else if (!bundle.includes(`e.update({basepath:\`${base}\`,`)) {
  throw new Error('TanStack Router hydration basepath was not found.');
}
bundle = bundle.replace('href:`/favicon.png`', `href:\`${base}/favicon.png\``);
bundle = bundle.replace('var M_=`modulepreload`,N_=function(e){return`/`+e}', `var M_=\`modulepreload\`,N_=function(e){return\`${base}/\`+e}`);
bundle = bundle.replace('$g=`/assets/styles-CR_D-fOd.css`', `$g=\`${base}/assets/styles-CR_D-fOd.css\``);
if (!bundle.includes(`N_=function(e){return\`${base}/\`+e}`)) {
  throw new Error('Dynamic asset base path was not updated.');
}
await writeFile(bundlePath, bundle);

const routePath = path.join(root, 'assets', 'routes-DElrTq2H.js');
let route = await readFile(routePath, 'utf8');
route = route.replaceAll('url:`/__l5e/', `url:\`${base}/__l5e/`);
await writeFile(routePath, route);

console.log('GitHub Pages base path applied.');
