'use strict';
// Optional separate-origin artifact: no dashboard, SDK, key or staff data is shipped.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'dist', 'public-demo');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'reservation'), { recursive: true });
const assets = ['index.html', 'model.js', 'demo.js', 'portal.js', 'portal.css', 'dining.svg'];
for (const file of assets) fs.copyFileSync(path.join(root, 'reservation', file), path.join(out, 'reservation', file));
for (const file of ['lucide-local.js', 'pwa-icon.svg']) fs.copyFileSync(path.join(root, file), path.join(out, file));
console.log('Public demonstration artifact: ' + path.relative(root, out) + ' (8 static files; no backend)');
