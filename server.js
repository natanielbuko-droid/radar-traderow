// Wersja lokalna bota: ten sam rdzeń i ten sam panel co we wtyczce, uruchamiane przez "node server.js".
// Tylko odczyt publicznych danych. Bot nie ma dostępu do żadnego portfela i nie składa zleceń.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCore } from './extension/lib/core.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.join(ROOT, 'extension');
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 8791;
fs.mkdirSync(DATA, { recursive: true });

const fileFor = (key) => path.join(DATA, `${key.replace(/[^a-zA-Z0-9_-]/g, '')}.json`);
const platform = {
  mode: 'local',
  load: async (key) => {
    try {
      return JSON.parse(await fs.promises.readFile(fileFor(key), 'utf8'));
    } catch (_) {
      return undefined;
    }
  },
  save: (key, value) => fs.promises.writeFile(fileFor(key), JSON.stringify(value)),
  notify: async (fresh) => {
    for (const e of fresh) console.log(new Date(e.ts).toLocaleTimeString('pl-PL'), e.text);
  },
};
const core = createCore(platform);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e5) reject(new Error('Za duże żądanie'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        reject(new Error('Niepoprawny JSON'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'POST' && url.pathname === '/rpc') {
      // Zapytania przyjmujemy tylko z naszej strony (ochrona przed obcymi witrynami w przeglądarce).
      const origin = req.headers.origin;
      if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return send(res, 403, { error: 'Niedozwolone źródło' });
      return send(res, 200, await core.handle(await readBody(req)));
    }
    if (req.method === 'GET') {
      // Pod /web/ serwujemy te same pliki co GitHub Pages: to podgląd wersji przeglądarkowej, w której bot działa w karcie.
      const web = url.pathname.startsWith('/web/');
      const rel = web ? decodeURIComponent(url.pathname.slice(5)) || 'dashboard.html' : url.pathname === '/' ? 'dashboard.html' : decodeURIComponent(url.pathname.slice(1));
      const file = path.resolve(EXT, rel);
      const type = TYPES[path.extname(file)];
      if (type && file.startsWith(EXT + path.sep) && (web || !rel.startsWith('lib')) && fs.existsSync(file)) {
        let body = fs.readFileSync(file);
        // Znacznik trybu lokalnego: panel wie wtedy, że ma rozmawiać z tym serwerem.
        if (!web && rel === 'dashboard.html') body = body.toString('utf8').replace('<html lang="pl">', '<html lang="pl" data-mode="local">');
        return send(res, 200, body, type);
      }
    }
    send(res, 404, { error: 'Nie znaleziono' });
  } catch (err) {
    send(res, 200, { error: String(err.message || err) });
  }
});

async function loop() {
  try {
    await core.tick();
  } catch (err) {
    console.error('Błąd odczytu:', err.message || err);
  }
  setTimeout(loop, core.getConfig().pollSeconds * 1000);
}

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`Research bot działa: http://localhost:${PORT}`);
  await core.ready;
  loop();
  core.maintain().catch(() => {});
  setInterval(() => core.maintain().catch(() => {}), 60000);
});
