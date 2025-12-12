import * as esbuild from 'esbuild';
import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';

// Find all TypeScript files in src directory
async function getEntryPoints(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await getEntryPoints(fullPath, base));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function build() {
  console.log('Building with esbuild...');

  const entryPoints = await getEntryPoints('./src');
  console.log(`Found ${entryPoints.length} TypeScript files`);

  try {
    await esbuild.build({
      entryPoints,
      outdir: 'dist',
      platform: 'node',
      target: 'node20',
      format: 'esm',
      sourcemap: false,
      bundle: false,
      outExtension: { '.js': '.js' },
      // Preserve directory structure
      outbase: 'src',
    });

    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
