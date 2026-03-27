import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { createManifest } from './scripts/lib/manifest.mjs';

const outputDirectoryByTarget = {
  chromium: 'dist/chromium',
  firefox: 'dist/firefox'
} as const;

function extensionManifestPlugin(target: 'chromium' | 'firefox') {
  return {
    name: 'extension-manifest',
    apply: 'build',
    async closeBundle() {
      const outputDirectory = resolve(
        __dirname,
        outputDirectoryByTarget[target]
      );
      await mkdir(outputDirectory, { recursive: true });
      await writeFile(
        resolve(outputDirectory, 'manifest.json'),
        `${JSON.stringify(createManifest(target), null, 2)}\n`,
        'utf8'
      );
    }
  };
}

export default defineConfig(({ mode }) => {
  const target = mode === 'firefox' ? 'firefox' : 'chromium';

  return {
    define: {
      __BROWSER_TARGET__: JSON.stringify(target)
    },
    plugins: [extensionManifestPlugin(target)],
    build: {
      outDir: outputDirectoryByTarget[target],
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'popup.html'),
          background: resolve(__dirname, 'src/background/index.ts'),
          content: resolve(__dirname, 'src/content/index.ts')
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'background') {
              return 'background.js';
            }

            if (chunkInfo.name === 'content') {
              return 'content.js';
            }

            return 'assets/[name]-[hash].js';
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]'
        }
      }
    }
  };
});
