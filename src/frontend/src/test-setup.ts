import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 25+ ships an experimental built-in `globalThis.localStorage` that is
// non-functional without the `--localstorage-file` flag (undefined / an empty
// object with no Storage methods), and it shadows the Storage jsdom would
// otherwise expose. CI runs Node 20 (real jsdom Storage), but local dev may be
// newer — so install a minimal in-memory Storage whenever the current global
// isn't a usable one. Idempotent and harmless where a real Storage exists.
function ensureLocalStorage(): void {
  const existing = (globalThis as { localStorage?: unknown }).localStorage as Storage | undefined;
  let usable = false;
  try {
    usable = typeof existing?.clear === 'function' && typeof existing?.setItem === 'function';
  } catch {
    usable = false; // a throwing getter counts as unusable
  }
  if (usable) return;

  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  const define = (target: object) => {
    try {
      Object.defineProperty(target, 'localStorage', {
        value: mock,
        writable: true,
        configurable: true,
      });
    } catch {
      // Non-configurable built-in (e.g. a future Node) — fall back to assignment.
      (target as { localStorage?: Storage }).localStorage = mock;
    }
  };
  define(globalThis);
  if (typeof window !== 'undefined' && window !== globalThis) define(window);
}

ensureLocalStorage();

afterEach(() => {
  cleanup();
});
