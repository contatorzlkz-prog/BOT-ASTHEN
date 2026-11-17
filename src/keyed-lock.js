const tails = new Map();

/**
 * Runs one operation at a time for a key while allowing unrelated keys to proceed
 * concurrently. Waiting operations re-check their state after the previous one ends.
 */
export async function runWithKeyedLock(key, action) {
  if (typeof action !== 'function') throw new TypeError('action precisa ser uma função');

  const previous = tails.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  tails.set(key, current);

  await previous;
  try {
    return await action();
  } finally {
    release();
    if (tails.get(key) === current) tails.delete(key);
  }
}
