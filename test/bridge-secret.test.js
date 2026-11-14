import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureBridgeSecret } from '../src/bridge.js';

test('integration key is created once and stays the same when the bot starts again', () => {
  const previousCwd = process.cwd();
  const previousSecret = process.env.DKB_SECRET;
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'asthen-secret-'));

  try {
    process.chdir(tempDir);
    delete process.env.DKB_SECRET;

    const first = ensureBridgeSecret();
    assert.equal(first.generated, true);
    assert.ok(first.token.length >= 32);

    const savedEnv = readFileSync(path.join(tempDir, '.env'), 'utf8');
    assert.ok(savedEnv.includes('DKB_SECRET=' + first.token));

    // This simulates dotenv loading the saved .env value on the next start.
    process.env.DKB_SECRET = first.token;
    const second = ensureBridgeSecret();
    assert.equal(second.generated, false);
    assert.equal(second.token, first.token);
    assert.equal(readFileSync(path.join(tempDir, '.env'), 'utf8'), savedEnv);
  } finally {
    process.chdir(previousCwd);
    if (previousSecret === undefined) delete process.env.DKB_SECRET;
    else process.env.DKB_SECRET = previousSecret;
    rmSync(tempDir, { recursive: true, force: true });
  }
});
