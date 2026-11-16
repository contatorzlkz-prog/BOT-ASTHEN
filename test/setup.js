import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = mkdtempSync(path.join(tmpdir(), 'asthen-bot-tests-'));
process.env.ASTHEN_TEST_MODE = '1';
process.env.ASTHEN_DATA_DIR = path.join(root, 'data');

// Automated tests must never connect to a configured production Supabase project.
process.env.SUPABASE_URL = '';
process.env.SUPABASE_PROJECT_URL = '';
process.env.SUPABASE_SECRET_KEY = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.SUPABASE_KEY = '';

process.once('exit', () => {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // Temporary test data is isolated; cleanup failure must not hide test results.
  }
});
