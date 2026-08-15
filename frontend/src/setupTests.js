import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// A working in-memory localStorage. The previous version replaced it with
// vi.fn() stubs that never stored anything, so getItem always returned
// undefined — which is exactly what made JSON.parse throw in AuthContext and
// hid a real crash-on-boot bug behind a passing test suite.
class MemoryStorage {
  #data = new Map();
  get length() { return this.#data.size; }
  key(i) { return [...this.#data.keys()][i] ?? null; }
  getItem(k) { return this.#data.has(String(k)) ? this.#data.get(String(k)) : null; }
  setItem(k, v) { this.#data.set(String(k), String(v)); }
  removeItem(k) { this.#data.delete(String(k)); }
  clear() { this.#data.clear(); }
}

Object.defineProperty(window, 'localStorage', {
  value: new MemoryStorage(),
  writable: true,
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
