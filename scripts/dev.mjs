import { spawn } from 'node:child_process';

const children = [
  spawn('node', ['--watch', 'server/app.js'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  }),
  spawn('npm', ['exec', '--', 'vite', '--host', '0.0.0.0'], {
    stdio: 'inherit',
  }),
];

let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const child of children) {
  child.on('exit', (code) => {
    stop();
    process.exitCode = code ?? 1;
  });
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
