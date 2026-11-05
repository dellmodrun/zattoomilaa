import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const tag = '<script src="/public-data.js"></script>';

async function htmlFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await htmlFiles(full));
    else if (entry.name.endsWith('.html')) result.push(full);
  }
  return result;
}

for (const file of await htmlFiles(root)) {
  let html = await readFile(file, 'utf8');
  if (!html.includes(tag)) html = html.replace('</head>', `${tag}</head>`);
  await writeFile(file, html);
}

console.log('Static public-data bridge installed.');
