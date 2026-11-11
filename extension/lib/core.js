// Wspólny rdzeń bota. Działa tak samo we wtyczce (proces w tle) i w wersji lokalnej (node server.js).
// "platform" dostarcza tylko to, co różni oba środowiska: zapis danych i sposób powiadamiania.
import * as hl from './hl.js';
import { analyze } from './stats.js';
import { simulate } from './backtest.js';
import { fetchAll } from './news.js';
import { Monitor } from './monitor.js';

export const DEFAULTS = {
  capitalUsd: 250, // ok. 1000 zł
  maxLeverage: 3,
  minOrderUsd: 10,
  pollSeconds: 15,
  feeBps: 4.5,
  slippageBps: 5,
  lookbackDays: 90,
  dexes: ['', 'xyz'], // '' = główny rynek krypto, 'xyz' = akcje, indeksy, złoto, srebro
  scanTop: 40,
  discordWebhook: '',
  telegramToken: '',
  telegramChatId: '',
  feeds: ['https://cointelegraph.com/rss', 'https://www.coindesk.com/arc/outboundfeeds/rss/', 'https://decrypt.co/feed'],
  watchlist: [],
};

const MIN = 60000;
const isAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
const clamp = (x, lo, hi, dflt) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
const usd = (x) => `$${x >= 1000 ? Math.round(x).toLocaleString('en-US') : x.toFixed(2)}`;
const shortAddr = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function describe(e) {
  const who = e.label || shortAddr(e.address);
  const head = `${who}: ${e.type} ${e.side} ${e.coin} (ruch ${usd(e.deltaUsd)}, cena ${e.px})`;
  if (e.type === 'ZAMKNIĘCIE') return `${head}. U nas: zamknąć pozycję.`;
  const pct = (e.share * 100).toFixed(1);
  const skip = e.note && e.note.startsWith('poniżej');
  const mine = skip ? `${usd(e.myTargetUsd)} (${e.note}, pominąć)` : `${usd(e.myTargetUsd)}${e.note ? ` (${e.note})` : ''}`;
  return `${head}. Pozycja to ${pct}% jego konta, dźwignia ${e.leverage || '?'}×. U nas proporcjonalnie: ${mine}.`;
}

export function createCore(platform) {
  let config = { ...DEFAULTS };
  let events = [];
  let pending = [];
  let board = null; // wiersze rankingu, ładowane dopiero gdy są potrzebne (kilka MB)
  let boardMeta = { at: 0, rows: 0, error: null };
  let boardLoading = false;
  let boardTriedAt = 0;
  let market = { coins: [], consensus: {}, scanned: 0, at: 0, error: null };
  let marketLoading = false;
  let marketTriedAt = 0;
  let newsState = { items: [], errors: [], at: 0 };
  let newsTriedAt = 0;
  let maintaining = false;
  const traderCache = new Map();

  const monitor = new Monitor({
    getConfig: () => config,
    onEvent: (e) => {
      e.text = describe(e);
      events.push(e);
      if (events.length > 300) events = events.slice(-300);
      pending.push(e);
    },
  });

  const ready = (async () => {
    config = { ...DEFAULTS, ...((await platform.load('config')) || {}) };
    events = (await platform.load('events')) || [];
    monitor.restore(await platform.load('monitor'));
    boardMeta = (await platform.load('boardMeta')) || boardMeta;
    market = (await platform.load('market')) || market;
    newsState = (await platform.load('news')) || newsState;
  })();

  const saveConfig = () => platform.save('config', config);

  async function getBoard() {
    if (!board) board = (await platform.load('board')) || [];
    return board;
  }

  // ---------- odczyt pozycji i alerty ----------
  async function webhooks(fresh) {
    const text = fresh.map((e) => e.text).join('\n').slice(0, 1800);
    const jobs = [];
    if (/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(config.discordWebhook)) {
      jobs.push(fetch(config.discordWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text }) }));
    }
    if (config.telegramToken && config.telegramChatId) {
      jobs.push(
        fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: config.telegramChatId, text }),
        }),
      );
    }
    await Promise.allSettled(jobs);
  }

  async function tick() {
    await ready;
    if (monitor.running) return;
    await monitor.cycle();
    await platform.save('monitor', monitor.dump());
    if (pending.length) {
      const fresh = pending.splice(0);
      await platform.save('events', events);
      await Promise.allSettled([platform.notify(fresh), webhooks(fresh)]);
    }
  }

  // ---------- ranking ----------
  async function refreshBoard() {
    if (boardLoading) return;
    boardLoading = true;
    boardTriedAt = Date.now();
    try {
      board = await hl.leaderboard();
      boardMeta = { at: Date.now(), rows: board.length, error: null };
      await platform.save('board', board);
    } catch (err) {
      boardMeta = { ...boardMeta, error: String(err.message || err) };
    } finally {
      boardLoading = false;
      await platform.save('boardMeta', boardMeta);
    }
  }

  function candidates(rows, q = {}) {
    const win = ['day', 'week', 'month', 'allTime'].includes(q.window) ? q.window : 'month';
    const minAv = clamp(q.minAv, 0, 1e12, 50000);
    const maxTurnover = clamp(q.maxTurnover, 0, 1e9, 60);
    const sort = q.sort === 'roi' ? 'roi' : 'pnl';
    const out = [];
    for (const r of rows) {
      const w = r[win];
      const m = r.month;
      if (!w || !m || r.accountValue < minAv) continue;
      if (w.pnl <= 0 || m.vlm <= 0) continue;
      if (!(r.allTime && r.allTime.pnl > 0)) continue;
      // Obrót miesięczny względem konta: bardzo wysoki oznacza automat albo animatora rynku.
      const turnover = m.vlm / r.accountValue;
      if (turnover > maxTurnover) continue;
      out.push({ ...r, turnover });
    }
    out.sort((a, b) => b[win][sort] - a[win][sort]);
    return out.slice(0, clamp(q.limit, 1, 300, 100));
  }

  // ---------- analiza tradera ----------
  async function analyzeTrader(address, force) {
    const key = address.toLowerCase();
    const hit = traderCache.get(key);
    if (!force && hit && Date.now() - hit.at < 10 * MIN) return hit;
    const since = Date.now() - config.lookbackDays * 86400000;
    const { fills, truncated } = await hl.fillsSince(key, since);
    const portfolio = await hl.portfolio(key);
    const metrics = analyze(fills, portfolio, truncated);
    const alloc = monitor.alloc();
    let mids = monitor.mids;
    if (!Object.keys(mids).length) mids = await hl.mids(config.dexes);
    const sim = simulate(fills, portfolio, config, alloc, mids);
    const row = (await getBoard()).find((r) => r.address === key) || null;
    const data = { address: key, at: Date.now(), metrics, sim, alloc, leaderboard: row, lookbackDays: config.lookbackDays };
    traderCache.set(key, data);
    return data;
  }

  // ---------- rynek i pozycje czołówki ----------
  async function refreshMarket() {
    if (marketLoading) return;
    marketLoading = true;
    marketTriedAt = Date.now();
    try {
      const coins = await hl.markets(config.dexes);
      const top = candidates(await getBoard(), { limit: config.scanTop });
      const cons = {};
      let scanned = 0;
      for (const r of top) {
        try {
          const snap = await hl.accountSnapshot(r.address, config.dexes);
          if (!(snap.perpEquity > 0)) continue;
          scanned++;
          for (const p of snap.positions) {
            const c = cons[p.coin] || (cons[p.coin] = { longs: 0, shorts: 0, longUsd: 0, shortUsd: 0, net: 0 });
            const share = Math.min(5, p.value / snap.perpEquity);
            if (p.szi > 0) {
              c.longs++;
              c.longUsd += p.value;
              c.net += share;
            } else {
              c.shorts++;
              c.shortUsd += p.value;
              c.net -= share;
            }
          }
        } catch (_) {
          /* pojedynczy błąd nie przerywa skanu */
        }
      }
      market = { coins, consensus: cons, scanned, at: Date.now(), error: null };
    } catch (err) {
      market = { ...market, error: String(err.message || err) };
    } finally {
      marketLoading = false;
      await platform.save('market', market);
    }
  }

  // ---------- newsy ----------
  async function refreshNews() {
    newsTriedAt = Date.now();
    try {
      const tickers = new Set();
      for (const t of monitor.view()) for (const p of t.positions) tickers.add(p.coin);
      const r = await fetchAll(config.feeds, [...tickers]);
      newsState = { ...r, at: Date.now() };
    } catch (err) {
      newsState = { ...newsState, errors: [String(err.message || err)] };
    }
    await platform.save('news', newsState);
  }

  // Okresowe odświeżanie cięższych danych. Po nieudanej próbie czekamy 5 minut przed kolejną.
  async function maintain() {
    await ready;
    if (maintaining) return;
    maintaining = true;
    try {
      const now = Date.now();
      const due = (at, tried, every) => now - at > every && now - tried > 5 * MIN;
      // Serwisy z newsami nie pozwalają czytać swoich kanałów ze zwykłej strony, więc w wersji przeglądarkowej je pomijamy.
      if (platform.mode !== 'web' && due(newsState.at, newsTriedAt, 10 * MIN)) await refreshNews();
      if (due(boardMeta.at, boardTriedAt, 60 * MIN)) await refreshBoard();
      if (boardMeta.at && due(market.at, marketTriedAt, 15 * MIN)) await refreshMarket();
    } finally {
      maintaining = false;
    }
  }

  function publicConfig() {
    const c = { ...config };
    c.telegramToken = c.telegramToken ? 'ustawiony' : '';
    c.discordWebhook = c.discordWebhook ? 'ustawiony' : '';
    return c;
  }

  // ---------- obsługa zapytań z panelu ----------
  async function handle(msg) {
    await ready;
    switch (msg && msg.type) {
      case 'state':
        // Gdy panel jest otwarty, to on pilnuje częstszego odświeżania pozycji.
        if (Date.now() - monitor.lastCycle >= config.pollSeconds * 1000) tick().catch(() => {});
        maintain().catch(() => {});
        return {
          mode: platform.mode,
          config: publicConfig(),
          alloc: monitor.alloc(),
          traders: monitor.view(),
          events: events.slice(-150).reverse(),
          status: {
            lastCycle: monitor.lastCycle,
            monitorError: monitor.lastError,
            boardAt: boardMeta.at,
            boardRows: boardMeta.rows,
            boardError: boardMeta.error,
            boardLoading,
          },
        };
      case 'candidates': {
        const watched = new Set(config.watchlist.map((w) => w.address));
        const rows = candidates(await getBoard(), msg.q).map((r) => ({ ...r, watched: watched.has(r.address) }));
        return { at: boardMeta.at, loading: boardLoading || !boardMeta.at, error: boardMeta.error, rows };
      }
      case 'trader':
        if (!isAddress(msg.address)) throw new Error('Niepoprawny adres portfela');
        return analyzeTrader(msg.address, msg.force);
      case 'market':
        return { ...market, loading: marketLoading };
      case 'news':
        return newsState;
      case 'watch': {
        if (!isAddress(msg.address)) throw new Error('Niepoprawny adres portfela');
        const address = msg.address.toLowerCase();
        const label = String(msg.label || '').slice(0, 40);
        const cur = config.watchlist.find((w) => w.address === address);
        if (msg.remove) config.watchlist = config.watchlist.filter((w) => w.address !== address);
        else if (cur) cur.label = label;
        else if (config.watchlist.length >= 25) throw new Error('Limit 25 obserwowanych traderów');
        else config.watchlist.push({ address, label });
        await saveConfig();
        traderCache.clear();
        await tick();
        return { ok: true };
      }
      case 'config': {
        const b = msg;
        if ('capitalUsd' in b) config.capitalUsd = clamp(b.capitalUsd, 10, 1e7, config.capitalUsd);
        if ('maxLeverage' in b) config.maxLeverage = clamp(b.maxLeverage, 0.1, 50, config.maxLeverage);
        if ('minOrderUsd' in b) config.minOrderUsd = clamp(b.minOrderUsd, 1, 1000, config.minOrderUsd);
        if ('pollSeconds' in b) config.pollSeconds = clamp(b.pollSeconds, 5, 600, config.pollSeconds);
        if ('lookbackDays' in b) config.lookbackDays = clamp(b.lookbackDays, 7, 365, config.lookbackDays);
        if ('slippageBps' in b) config.slippageBps = clamp(b.slippageBps, 0, 200, config.slippageBps);
        if (typeof b.discordWebhook === 'string' && b.discordWebhook !== 'ustawiony') config.discordWebhook = b.discordWebhook.trim();
        if (typeof b.telegramToken === 'string' && b.telegramToken !== 'ustawiony') config.telegramToken = b.telegramToken.trim();
        if (typeof b.telegramChatId === 'string') config.telegramChatId = b.telegramChatId.trim();
        await saveConfig();
        traderCache.clear();
        return { ok: true, config: publicConfig() };
      }
      default:
        throw new Error('Nieznane zapytanie');
    }
  }

  return { handle, tick, maintain, getConfig: () => config, ready };
}
