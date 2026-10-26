import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
await build({
  entryPoints: ['src/server/index.ts', 'src/server/worker.ts', 'src/server/cli.ts', 'src/server/render/thread.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outdir: 'dist/server',
  sourcemap: true,
  external: Object.keys(pkg.dependencies),
  alias: { '@shared': './src/shared' },
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});
console.log('server built');
