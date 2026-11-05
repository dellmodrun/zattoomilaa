import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.mjs', '.md', '.txt']);
const socialImage = 'https://dellmodrun.github.io/zattoomilaa/__l5e/assets-v1/bb2c4044-e991-42ab-a930-7d1ba68163e0/zattoo-mark.png';

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(full));
    else if (textExtensions.has(path.extname(entry.name))) result.push(full);
  }
  return result;
}

for (const file of await files(root)) {
  let content = await readFile(file, 'utf8');
  const preservedX = ['__PRESERVED_', 'X_LINK__'].join('');
  content = content
    .replaceAll('https://x.com/zattoomillion', preservedX)
    .replaceAll('ZATTOO', 'ZATTOO')
    .replaceAll('Zattoo', 'Zattoo')
    .replaceAll('zattoo', 'zattoo')
    .replaceAll(preservedX, 'https://x.com/zattoomillion');

  if (file.endsWith('.html')) {
    content = content
      .replace(/(<meta property="og:image" content=")[^"]+("\s*\/?>)/g, `$1${socialImage}$2`)
      .replace(/(<meta name="twitter:image" content=")[^"]+("\s*\/?>)/g, `$1${socialImage}$2`);
  }

  await writeFile(file, content);
}

console.log('Project name changed to zattoo.');
