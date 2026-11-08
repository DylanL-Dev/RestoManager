'use strict';
// Publish only explicitly reviewed browser assets. Never copy the repository root.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'dist');
const FILES = JSON.parse(fs.readFileSync(path.join(__dirname, 'public-files.json'), 'utf8'));
const seen = new Set();

if (!Array.isArray(FILES) || FILES.length === 0) throw Error('Manifest public absent ou vide.');
if (fs.existsSync(OUTPUT) && fs.lstatSync(OUTPUT).isSymbolicLink()) {
  throw Error('Refus de suivre un lien symbolique dist/.');
}
fs.rmSync(OUTPUT, { recursive: true, force: true });
fs.mkdirSync(OUTPUT, { recursive: true });

for (const relative of FILES) {
  if (typeof relative !== 'string' ||
      !/^[a-zA-Z0-9._/-]+$/.test(relative) ||
      relative.startsWith('/') || relative.includes('..') ||
      path.posix.normalize(relative) !== relative ||
      seen.has(relative)) throw Error('Chemin public invalide ou en doublon : ' + String(relative));
  seen.add(relative);
  const source = path.join(ROOT, relative);
  const destination = path.join(OUTPUT, relative);
  const stat = fs.lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw Error('Seuls les fichiers réguliers sont autorisés : ' + relative);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}
console.log('Publication statique : ' + FILES.length + ' fichiers autorisés dans dist/.');
console.log('SQL, tests, documentation, outils de développement et secrets non copiés.');
