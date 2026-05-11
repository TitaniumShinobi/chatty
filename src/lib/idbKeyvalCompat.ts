const DB_NAME = "chatty-hydration-cache";
const STORE_NAME = "keyval";
const memoryStore = new Map<string, unknown>();

function hasIndexedDB() {
  return typeof indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDB()) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }

    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = run(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("IndexedDB transaction failed"));
    };
  });
}

export async function get<T = unknown>(key: string): Promise<T | undefined> {
  if (!hasIndexedDB()) {
    return memoryStore.get(key) as T | undefined;
  }
  return withStore<T | undefined>("readonly", (store) => store.get(key));
}

export async function set<T = unknown>(key: string, value: T): Promise<void> {
  memoryStore.set(key, value);
  if (!hasIndexedDB()) return;
  await withStore<IDBValidKey>("readwrite", (store) => store.put(value, key));
}

export async function del(key: string): Promise<void> {
  memoryStore.delete(key);
  if (!hasIndexedDB()) return;
  await withStore<undefined>("readwrite", (store) => store.delete(key));
}
