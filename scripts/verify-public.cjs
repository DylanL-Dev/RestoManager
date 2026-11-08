'use strict';
// Checks the GENERATED public artifact, never the repository source directory.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const DEST = path.join(ROOT, 'dist');
const allow = JSON.parse(fs.readFileSync(path.join(__dirname, 'public-files.json'), 'utf8'));
const expected = new Set(allow);
const found = [];

function visit(folder, prefix = '') {
  for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
    const relative = prefix ? prefix + '/' + item.name : item.name;
    const full = path.join(folder, item.name);
    assert.ok(!item.isSymbolicLink(), 'Lien symbolique interdit dans dist/ : ' + relative);
    if (item.isDirectory()) visit(full, relative);
    else {
      assert.ok(item.isFile(), 'Entrée non régulière dans dist/ : ' + relative);
      found.push(relative);
    }
  }
}
assert.ok(fs.existsSync(DEST), 'Construire dist/ avant cette vérification.');
visit(DEST);
assert.deepEqual(found.sort(), [...expected].sort(), 'Le contenu public ne correspond pas à la liste autorisée.');

for (const relative of found) {
  assert.ok(!/(?:^|\/)(?:supabase|tests|docs|scripts|node_modules|\.github|\.git)(?:\/|$)/i.test(relative),
    'Dossier interne publié : ' + relative);
  assert.ok(!/\.(?:sql|cjs|md|map|env|log|lock|yml|yaml|ts)$/i.test(relative),
    'Extension interne publiée : ' + relative);
  const source = fs.readFileSync(path.join(ROOT, relative));
  const published = fs.readFileSync(path.join(DEST, relative));
  assert.ok(source.equals(published), 'Asset modifié pendant la construction : ' + relative);
}

for (const must of ['v3-connected.html', 'login.html', 'index.html', 'service-v3.js',
  'service-v3.css', 'v3-connected-auth.js', 'asset/img/logo.png', 'manifest.json']) {
  assert.ok(expected.has(must), 'Point d’entrée ou asset vital non autorisé : ' + must);
}

let references = 0;
function localResource(page, url) {
  if (!url || /^(?:#|data:|https?:|\/\/|mailto:|tel:|javascript:)/i.test(url)) return;
  const clean = url.split(/[?#]/)[0];
  if (!clean) return;
  const base = clean.startsWith('/') ? clean.slice(1) : path.posix.join(path.posix.dirname(page), clean);
  const name = path.posix.normalize(base);
  assert.ok(expected.has(name), 'Référence absente de la publication : ' + page + ' → ' + url);
  references++;
}
for (const page of found.filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(DEST, page), 'utf8');
  for (const tag of html.match(/<(?:script|link|img)\b[^>]*>/gi) || []) {
    if (/^<link\b/i.test(tag) && !/\brel\s*=\s*["'](?:stylesheet|icon|manifest|apple-touch-icon|preload|modulepreload)["']/i.test(tag)) continue;
    const attr = /^<link\b/i.test(tag) ? 'href' : 'src';
    const match = tag.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i);
    if (match) localResource(page, match[1]);
  }
}

console.log('Contrôle public : ' + found.length + ' fichiers exclusivement autorisés.');
console.log('Références HTML locales contrôlées : ' + references + '.');
console.log('Aucun SQL, test, outil interne ou fichier de configuration publié.');
