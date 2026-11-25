import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  acquireRuntimeLock,
  assertBotStopped,
  createBackup,
  listBackups,
  restoreBackup,
  verifyBackup
} from '../src/maintenance.js';

test('backup verifies hashes and restore creates a safety backup', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asthen-backup-'));
  const projectDir = path.join(root, 'project');
  const dataDir = path.join(projectDir, 'data');
  const backupDir = path.join(projectDir, 'backups');
  fs.mkdirSync(dataDir, { recursive: true });

  try {
    fs.writeFileSync(path.join(projectDir, '.env'), 'DISCORD_TOKEN=token-original\n');
    fs.writeFileSync(path.join(dataDir, 'state.json'), '{"tickets":{"one":{"status":"open"}}}\n');
    fs.writeFileSync(path.join(dataDir, 'bridge-queue.json'), '{"version":1,"jobs":[]}\n');

    const backup = createBackup({ projectDir, dataDir, backupDir });
    assert.equal(verifyBackup(backup.id, { projectDir, backupDir }).valid, true);

    fs.writeFileSync(path.join(projectDir, '.env'), 'DISCORD_TOKEN=token-novo\n');
    fs.writeFileSync(path.join(dataDir, 'state.json'), '{"tickets":{}}\n');

    const restored = restoreBackup(backup.id, {
      projectDir,
      dataDir,
      backupDir,
      checkRuntime: false
    });

    assert.equal(fs.readFileSync(path.join(projectDir, '.env'), 'utf8'), 'DISCORD_TOKEN=token-original\n');
    assert.match(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'), /"one"/);
    assert.equal(verifyBackup(restored.safetyBackup, { projectDir, backupDir }).valid, true);
    assert.equal(listBackups({ projectDir, backupDir }).length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('backup verification rejects changed files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asthen-backup-hash-'));
  const projectDir = path.join(root, 'project');
  const dataDir = path.join(projectDir, 'data');
  const backupDir = path.join(projectDir, 'backups');
  fs.mkdirSync(dataDir, { recursive: true });

  try {
    fs.writeFileSync(path.join(dataDir, 'state.json'), '{"guilds":{}}\n');
    const backup = createBackup({ projectDir, dataDir, backupDir });
    fs.writeFileSync(path.join(backupDir, backup.id, 'data', 'state.json'), 'modified');
    const result = verifyBackup(backup.id, { projectDir, backupDir });
    assert.equal(result.valid, false);
    assert.match(result.error, /Integridade inválida/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime lock prevents a second process and is removable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asthen-lock-'));
  const dataDir = path.join(root, 'data');
  try {
    const release = acquireRuntimeLock(dataDir);
    assert.throws(() => acquireRuntimeLock(dataDir), /Já existe um ASTHEN BOT/);
    assert.throws(() => assertBotStopped(dataDir), /ainda está em execução/);
    release();
    assert.doesNotThrow(() => assertBotStopped(dataDir));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
