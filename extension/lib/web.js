// Wersja przeglądarkowa: bot działa w otwartej karcie jako zwykła strona, bez instalacji.
// Ustawienia i listę obserwowanych trzyma w pamięci przeglądarki (IndexedDB), osobno u każdej osoby.
import { createCore } from './core.js';

const opened = new Promise((resolve, reject) => {
  const req = indexedDB.open('radar-traderow', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('kv');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function run(mode, action) {
  const db = await opened;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', mode);
    const req = action(tx.objectStore('kv'));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const platform = {
  mode: 'web',
  load: (key) => run('readonly', (store) => store.get(key)).catch(() => undefined),
  save: (key, value) => run('readwrite', (store) => store.put(value, key)).catch(() => {}),
  notify: async () => {}, // powiadomienia pokazuje sam panel, gdy użytkownik je włączy
};

export const core = createCore(platform);
