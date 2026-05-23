#!/usr/bin/env node
// Wraps `next dev`:
//   1. Clears anything on PORT (default 3000) — sends SIGTERM, escalates to SIGKILL,
//      then waits for the kernel to actually release the socket. Silent unless --verbose.
//   2. Starts `next dev`.
//   3. Polls the URL and opens it in the user's preferred app when it responds.
//      Set OPEN_WITH=cursor (or any app name) to route the URL there; default is the
//      OS default browser.

import { spawn, execSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { platform } from 'node:os';

const port = process.env.PORT || '3000';
const url = `http://localhost:${port}`;
const verbose = process.argv.includes('--verbose');

function log(msg) {
  if (verbose) console.error(`[dev] ${msg}`);
}

function pidsOnPort(p) {
  try {
    const out = execSync(`lsof -ti :${p}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (!out) return [];
    return out.split('\n').map((s) => Number(s)).filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

function isPortFree(p) {
  return new Promise((resolve) => {
    const sock = createConnection({ host: '127.0.0.1', port: Number(p) });
    sock.once('connect', () => {
      sock.destroy();
      resolve(false);
    });
    sock.once('error', () => {
      resolve(true);
    });
    setTimeout(() => {
      sock.destroy();
      resolve(true);
    }, 300);
  });
}

async function clearPort(p) {
  const initial = pidsOnPort(p);
  if (initial.length === 0) {
    log(`port ${p} already free`);
    return;
  }
  log(`port ${p} held by ${initial.join(', ')} — sending SIGTERM`);
  for (const pid of initial) {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
  await new Promise((r) => setTimeout(r, 500));
  const still = pidsOnPort(p);
  if (still.length > 0) {
    log(`escalating SIGKILL on ${still.join(', ')}`);
    for (const pid of still) {
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
  }
  for (let i = 0; i < 20; i++) {
    if (await isPortFree(p) && pidsOnPort(p).length === 0) {
      log(`port ${p} released`);
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  console.error(`[dev] WARNING: port ${p} still busy after 2s — next dev may fail to bind.`);
}

function openUrl() {
  const target = process.env.OPEN_WITH;
  let cmd;
  if (platform() === 'darwin') {
    cmd = target ? ['open', '-a', target, url] : ['open', url];
  } else if (platform() === 'win32') {
    cmd = ['cmd', '/c', 'start', '""', url];
  } else {
    cmd = ['xdg-open', url];
  }
  spawn(cmd[0], cmd.slice(1), { detached: true, stdio: 'ignore' }).unref();
}

await clearPort(port);

const next = spawn('next', ['dev'], { stdio: 'inherit', env: { ...process.env, PORT: port } });
next.on('exit', (code) => process.exit(code ?? 0));

let opened = false;
const start = Date.now();
const timeoutMs = 30_000;

const poll = setInterval(async () => {
  if (opened) return clearInterval(poll);
  if (Date.now() - start > timeoutMs) {
    clearInterval(poll);
    return;
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(800) });
    if (res.ok || res.status === 404) {
      opened = true;
      clearInterval(poll);
      openUrl();
    }
  } catch {
    // server not ready yet
  }
}, 400);

const cleanup = () => {
  clearInterval(poll);
  if (!next.killed) next.kill('SIGINT');
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
