import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const root = resolve(__dirname);
const outDir = resolve(root, 'dist');

function copyStaticPlugin() {
  return {
    name: 'ct-c-copy-static',
    closeBundle() {
      mkdirSync(outDir, { recursive: true });
      const manifestSrc = resolve(root, 'manifest.generated.json');
      if (existsSync(manifestSrc)) {
        copyFileSync(manifestSrc, resolve(outDir, 'manifest.json'));
      }
      const optionsHtml = resolve(root, 'src/options/options.html');
      if (existsSync(optionsHtml)) {
        let html = readFileSync(optionsHtml, 'utf8');
        html = html.replace('./options.ts', './options.js');
        writeFileSync(resolve(outDir, 'options.html'), html);
      }
      const iconsDir = resolve(outDir, 'icons');
      mkdirSync(iconsDir, { recursive: true });
      for (const size of [16, 32, 48, 128]) {
        const src = resolve(root, `icons/icon-${size}.png`);
        if (existsSync(src)) copyFileSync(src, resolve(iconsDir, `icon-${size}.png`));
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  define: {
    __TEST_HOST__: JSON.stringify(mode === 'test'),
  },
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    target: 'chrome116',
    rollupOptions: {
      input: {
        background: resolve(root, 'src/background/index.ts'),
        content: resolve(root, 'src/content/index.ts'),
        options: resolve(root, 'src/options/options.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        format: 'es',
      },
    },
  },
  plugins: [copyStaticPlugin()],
}));
