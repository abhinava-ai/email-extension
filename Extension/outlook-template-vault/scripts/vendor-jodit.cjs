const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'node_modules', 'jodit');
const target = path.join(root, 'vendor', 'jodit');
fs.mkdirSync(target, { recursive: true });
for (const filename of ['jodit.min.js', 'jodit.min.css']) {
  fs.copyFileSync(path.join(source, 'es2021', filename), path.join(target, filename));
}
const license = fs.readdirSync(source).find((filename) => /^license(?:\.|$)/i.test(filename));
if (!license) throw new Error('Jodit license file is missing');
fs.copyFileSync(path.join(source, license), path.join(target, 'LICENSE'));
