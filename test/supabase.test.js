import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSupabaseUrl } from '../src/supabase.js';

test('normaliza URL base do Supabase', () => {
  assert.equal(
    normalizeSupabaseUrl('https://exemplo.supabase.co/rest/v1/'),
    'https://exemplo.supabase.co'
  );
  assert.equal(
    normalizeSupabaseUrl('https://exemplo.supabase.co/v1'),
    'https://exemplo.supabase.co'
  );
  assert.equal(
    normalizeSupabaseUrl('https://exemplo.supabase.co'),
    'https://exemplo.supabase.co'
  );
});

test('não transforma URL vazia em endereço válido', () => {
  assert.equal(normalizeSupabaseUrl(''), '');
  assert.equal(normalizeSupabaseUrl(null), '');
});
