const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
esbuild.buildSync({
  absWorkingDir: root,
  entryPoints: ['./src/auth-entry.js'],
  outfile: 'auth.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome114'],
  legalComments: 'none',
  minify: true
});
console.log('Bundled private API authentication into auth.js');
