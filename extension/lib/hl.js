// Klient publicznego API Hyperliquid (tylko odczyt, bez kluczy).


const API = 'https://api.hyperliquid.xyz/info';
const LEADERBOARD_URL = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';

// Limit API to 1200 jednostek wagi na minutę na adres IP. Trzymamy się ~1000.
const MS_PER_WEIGHT = 60;
const WEIGHTS = {
  clearinghouseState: 2,
  spotClearinghouseState: 2,
  allMids: 2,
  metaAndAssetCtxs: 20,
  userFills: 20,
  userFillsByTime: 20,
  portfolio: 20,
};

let nextSlot = 0;
function reserveSlot(weight) {
  const now = Date.now();
  const start = Math.max(now, nextSlot);
  nextSlot = start + weight * MS_PER_WEIGHT;
  return start - now;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function info(body, { retries = 3, timeoutMs = 25000 } = {}) {
  const weight = WEIGHTS[body.type] || 20;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const wait = reserveSlot(weight);
    if (wait > 0) await sleep(wait);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429) {
        nextSlot = Date.now() + 5000 * (attempt + 1);
        lastErr = new Error('Limit zapytań API (429)');
        continue;
      }
      if (!res.ok) throw new Error(`API ${body.type}: HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await sleep(800 * (attempt + 1));
    }
  }
  throw lastErr;
}

const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

function parsePositions(state) {
  const out = [];
  for (const ap of state.assetPositions || []) {
    const p = ap.position;
    const szi = num(p.szi);
    if (!szi) continue;
    const value = num(p.positionValue);
    out.push({
      coin: p.coin,
      szi,
      side: szi > 0 ? 'LONG' : 'SHORT',
      value,
      markPx: value / Math.abs(szi),
      entryPx: num(p.entryPx),
      leverage: p.leverage ? num(p.leverage.value) : null,
      leverageType: p.leverage ? p.leverage.type : null,
      liqPx: p.liquidationPx == null ? null : num(p.liquidationPx),
      unrealizedPnl: num(p.unrealizedPnl),
    });
  }
  return out;
}

// Pozycje i wartość konta na wszystkich śledzonych rynkach (główny + np. "xyz" z akcjami i surowcami).
async function accountSnapshot(address, dexes) {
  let perpEquity = 0;
  let positions = [];
  for (const dex of dexes) {
    const body = { type: 'clearinghouseState', user: address };
    if (dex) body.dex = dex;
    const st = await info(body);
    perpEquity += num(st.marginSummary && st.marginSummary.accountValue);
    positions = positions.concat(parsePositions(st));
  }
  return { perpEquity, positions };
}

async function spotUsd(address) {
  const st = await info({ type: 'spotClearinghouseState', user: address });
  let usd = 0;
  for (const b of st.balances || []) {
    if (b.coin === 'USDC' || b.coin === 'USDT0' || b.coin === 'USDH' || b.coin === 'USDE') usd += num(b.total);
  }
  return usd;
}

async function mids(dexes) {
  const out = {};
  for (const dex of dexes) {
    const body = { type: 'allMids' };
    if (dex) body.dex = dex;
    const m = await info(body);
    for (const k of Object.keys(m)) out[k] = num(m[k]);
  }
  return out;
}

async function markets(dexes) {
  const out = [];
  for (const dex of dexes) {
    const body = { type: 'metaAndAssetCtxs' };
    if (dex) body.dex = dex;
    const [meta, ctxs] = await info(body);
    meta.universe.forEach((u, i) => {
      if (u.isDelisted) return;
      const c = ctxs[i] || {};
      const mark = num(c.markPx);
      const prev = num(c.prevDayPx);
      out.push({
        coin: u.name,
        dex: dex || 'główny',
        maxLeverage: u.maxLeverage,
        markPx: mark,
        change24h: prev ? mark / prev - 1 : 0,
        funding: num(c.funding), // stawka za 1 godzinę
        openInterestUsd: num(c.openInterest) * mark,
        volume24hUsd: num(c.dayNtlVlm),
      });
    });
  }
  return out;
}

const isPerpFill = (f) => typeof f.dir === 'string' && /Long|Short/.test(f.dir) && !f.coin.startsWith('@') && !f.coin.includes('/');

// Historia transakcji od startTime, rosnąco. API oddaje najwyżej 2000 na stronę i 10000 najnowszych łącznie.
async function fillsSince(address, startTime, maxPages = 5) {
  let all = [];
  let cursor = startTime;
  let truncated = false;
  for (let page = 0; page < maxPages; page++) {
    const chunk = await info({
      type: 'userFillsByTime',
      user: address,
      startTime: cursor,
      endTime: Date.now(),
      aggregateByTime: true,
    });
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    all = all.concat(chunk);
    if (chunk.length < 2000) break;
    cursor = chunk[chunk.length - 1].time + 1;
    if (page === maxPages - 1) truncated = true;
  }
  const seen = new Set();
  const fills = [];
  for (const f of all) {
    const key = `${f.tid}|${f.oid}|${f.time}|${f.sz}`;
    if (seen.has(key) || !isPerpFill(f)) continue;
    seen.add(key);
    fills.push({
      coin: f.coin,
      px: num(f.px),
      sz: num(f.sz),
      signed: f.side === 'B' ? num(f.sz) : -num(f.sz),
      time: f.time,
      startPosition: num(f.startPosition),
      dir: f.dir,
      closedPnl: num(f.closedPnl),
      fee: f.feeToken === 'USDC' || !f.feeToken ? num(f.fee) : 0,
    });
  }
  fills.sort((a, b) => a.time - b.time);
  return { fills, truncated };
}

async function portfolio(address) {
  const raw = await info({ type: 'portfolio', user: address });
  const out = {};
  for (const [key, v] of raw) {
    out[key] = {
      accountValue: (v.accountValueHistory || []).map(([t, x]) => [t, num(x)]),
      pnl: (v.pnlHistory || []).map(([t, x]) => [t, num(x)]),
      vlm: num(v.vlm),
    };
  }
  return out;
}

// Ranking to jeden plik ~40 MB ze wszystkimi kontami; zostawiamy tylko potrzebne pola.
async function leaderboard() {
  const res = await fetch(LEADERBOARD_URL, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`Ranking: HTTP ${res.status}`);
  const data = await res.json();
  const rows = [];
  for (const r of data.leaderboardRows || []) {
    const av = num(r.accountValue);
    if (av < 10000) continue;
    const row = { address: r.ethAddress, name: r.displayName || null, accountValue: av };
    for (const [win, p] of r.windowPerformances || []) {
      row[win] = { pnl: num(p.pnl), roi: num(p.roi), vlm: num(p.vlm) };
    }
    rows.push(row);
  }
  return rows;
}

export { info, accountSnapshot, spotUsd, mids, markets, fillsSince, portfolio, leaderboard, num };
