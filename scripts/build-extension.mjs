import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve('extension');
const target = resolve('dist-extension');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const file of ['manifest.json', 'popup.html', 'popup.js', 'popup.css']) {
  await cp(resolve(source, file), resolve(target, file));
}
process.stdout.write(`Built safe purchase-handoff extension at ${target}\n`);
