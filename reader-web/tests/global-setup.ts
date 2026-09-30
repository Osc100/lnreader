import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default function globalSetup() {
  const root = path.resolve(__dirname, '..', '..');
  execFileSync(
    process.execPath,
    [path.join(root, 'scripts', 'build-reader.mjs'), '--dev'],
    { cwd: root, stdio: 'inherit' },
  );
}
