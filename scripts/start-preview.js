import { spawn } from 'node:child_process';
import path from 'node:path';

const port = process.env.PORT || '4321';
const isWindows = process.platform === 'win32';
const astroBin = path.resolve(
  `node_modules/.bin/astro${isWindows ? '.cmd' : ''}`
);
const args = ['preview', '--host', '0.0.0.0', '--port', port];
const command = isWindows ? process.env.ComSpec || 'cmd.exe' : astroBin;
const commandArgs = isWindows ? ['/c', astroBin, ...args] : args;

const preview = spawn(command, commandArgs, { stdio: 'inherit' });

preview.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

preview.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
