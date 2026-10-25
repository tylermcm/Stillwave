import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const temporary = path.resolve('.build-tmp');
await mkdir(temporary, { recursive: true });
// Separate exports avoid concurrent Hermes writers targeting the same temporary
// index.hbc on Windows. Keep compiler output inside the writable workspace.
for (const platform of ['android', 'ios', 'web']) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/expo/bin/cli', 'export', '--platform', platform, '--output-dir', `dist/${platform}`, '--max-workers', '2'], {
      stdio: 'inherit',
      env: { ...process.env, TEMP: temporary, TMP: temporary, TMPDIR: temporary, EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1' },
    });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  if (code !== 0) process.exit(Number(code));
}
