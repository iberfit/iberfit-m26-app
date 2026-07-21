import { createIndexedDbRepository } from './indexeddb.js';
import { createLocalStorageRepository } from './local-storage.js';
import { createSupabaseRepository } from './supabase.js';
import { createHybridRepository } from './hybrid.js';
import { createMemoryRepository } from './memory.js';

async function createLocalRepository() {
  if ('indexedDB' in globalThis) {
    try {
      const repository = createIndexedDbRepository();
      await repository.getState();
      return repository;
    } catch (error) {
      console.warn('IBERFIT IndexedDB no disponible; se usa fallback localStorage.', error);
    }
  }
  return createLocalStorageRepository();
}

export async function createRepository(options = {}) {
  const local = globalThis.__IBERFIT_TEST_MEMORY__ === true ? createMemoryRepository() : await createLocalRepository();
  const config = options.supabaseConfig || globalThis.__IBERFIT_SUPABASE__;
  if (!config?.enabled) return local;

  try {
    const remote = createSupabaseRepository(config, options.dependencies);
    return createHybridRepository(local, remote);
  } catch (error) {
    console.error('IBERFIT Supabase staging no pudo habilitarse; se mantiene modo local seguro.', error);
    return local;
  }
}
