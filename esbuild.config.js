const esbuild = require('esbuild');
const { copyFileSync } = require('fs');
const { join } = require('path');

const isWatch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const config = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outdir: 'dist',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
  treeShaking: true,
  logLevel: 'info',
};

async function main() {
  if (isWatch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
    console.log('[esbuild] watching...');
  } else {
    await esbuild.build(config);
    console.log('[esbuild] build complete');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
