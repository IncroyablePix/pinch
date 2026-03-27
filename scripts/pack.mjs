import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import archiver from 'archiver';
import { resolveBrowserTarget } from './lib/browser-target.mjs';

const target = resolveBrowserTarget(process.argv[2]);
const sourceDirectory = resolve('dist', target);
const packagesDirectory = resolve('packages');
const archivePath = resolve(packagesDirectory, `pinch-${target}.zip`);

await mkdir(packagesDirectory, { recursive: true });

const output = createWriteStream(archivePath);
const archive = archiver('zip', { zlib: { level: 9 } });

const archiveClosed = new Promise((resolvePromise, rejectPromise) => {
  output.on('close', resolvePromise);
  output.on('error', rejectPromise);
  archive.on('warning', (error) => {
    if (error.code !== 'ENOENT') {
      rejectPromise(error);
    }
  });
  archive.on('error', rejectPromise);
});

archive.pipe(output);
archive.directory(sourceDirectory, false);
await archive.finalize();
await archiveClosed;
