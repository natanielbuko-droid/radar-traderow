// Wersja przeglądarkowa: bot działa w otwartej karcie jako zwykła strona, bez instalacji.
// Ustawienia i listę obserwowanych trzyma w pamięci przeglądarki (IndexedDB), osobno u każdej osoby.
import { createCore } from './core.js';

// Gdy pamięć przeglądarki jest niedostępna (tryb prywatny, blokada przez inną kartę),
// bot działa dalej, tylko nie zapamiętuje danych po zamknięciu karty.
const memory = new Map();
const opened = new Promise((resolve) => {
  const giveUp = setTimeout(() => resolve(null), 4000);
  const done = (db) => {
    clearTimeout(giveUp);
    resolve(db);
  };
  try {
    const req = indexedDB.open('radar-traderow', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => {
      const db = req.result;
      // Nie blokujemy innych kart, które chcą zmienić albo wyczyścić bazę.
      db.onversionchange = () => db.close();
      done(db);
    };
    req.onerror = () => done(null);
  } catch (_) {
    done(null);
  }
});

async function run(mode, action) {
  const db = await opened;
  if (!db) throw new Error('pamięć przeglądarki niedostępna');
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
  load: (key) => run('readonly', (store) => store.get(key)).catch(() => memory.get(key)),
  save: (key, value) => run('readwrite', (store) => store.put(value, key)).catch(() => void memory.set(key, value)),
  notify: async () => {}, // powiadomienia pokazuje sam panel, gdy użytkownik je włączy
};

export const core = createCore(platform);
