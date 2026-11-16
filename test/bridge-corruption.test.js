import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startBridge } from '../src/bridge.js';

const secret = 'ASTHEN_TEST_SECRET_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ';

test('Bridge não substitui fila persistente corrompida e cria backup de recuperação', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'asthen-bridge-corrupt-'));
  const queueFile = path.join(root, 'bridge-queue.json');
  const corrupt = '{"version":1,"jobs":';
  writeFileSync(queueFile, corrupt, 'utf8');

  try {
    await assert.rejects(
      startBridge({ token: secret, host: '127.0.0.1', port: 0, dataDir: root }),
      /fila persistente da Bridge está corrompida/i
    );
    assert.equal(readFileSync(queueFile, 'utf8'), corrupt);
    const backups = readdirSync(root).filter(name =>
      name.startsWith('bridge-queue.json.corrupt-') && name.endsWith('.bak')
    );
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(path.join(root, backups[0]), 'utf8'), corrupt);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
