// Śledzenie pozycji obserwowanych traderów: wykrywanie ruchów i przeliczanie ich na nasz kapitał.


import * as hl from './hl.js';

// Przelicza pozycję tradera na kwotę proporcjonalną do naszego kapitału.
// share = jaka część konta tradera siedzi w pozycji; levScale tnie całość, gdy trader gra wyższą dźwignią niż nasz limit.
function suggest(positionValue, traderEquity, traderTotalNotional, cfg, alloc) {
  if (!(traderEquity > 0) || !(alloc > 0)) return { usd: 0, share: 0, levScale: 1, note: 'brak danych o koncie tradera' };
  const share = positionValue / traderEquity;
  const traderLev = traderTotalNotional / traderEquity;
  const levScale = traderLev > cfg.maxLeverage ? cfg.maxLeverage / traderLev : 1;
  const usd = share * alloc * levScale;
  let note = '';
  if (usd > 0 && usd < cfg.minOrderUsd) note = `poniżej minimum ${cfg.minOrderUsd} USD`;
  else if (levScale < 1) note = `przycięte limitem dźwigni ${cfg.maxLeverage}×`;
  return { usd, share, levScale, note };
}

class Monitor {
  constructor({ getConfig, onEvent }) {
    this.getConfig = getConfig;
    this.onEvent = onEvent;
    this.traders = new Map(); // address -> stan
    this.mids = {};
    this.lastCycle = 0;
    this.lastError = null;
    this.running = false;
  }

  alloc() {
    const cfg = this.getConfig();
    const n = Math.max(1, cfg.watchlist.length);
    return cfg.capitalUsd / n;
  }

  sync() {
    const cfg = this.getConfig();
    const wanted = new Set(cfg.watchlist.map((w) => w.address.toLowerCase()));
    for (const a of [...this.traders.keys()]) if (!wanted.has(a)) this.traders.delete(a);
    for (const w of cfg.watchlist) {
      const a = w.address.toLowerCase();
      if (!this.traders.has(a)) {
        this.traders.set(a, { address: a, label: w.label || '', positions: null, perpEquity: 0, spotUsd: 0, spotAt: 0, lastPoll: 0, error: null });
      } else {
        this.traders.get(a).label = w.label || '';
      }
    }
  }

  async cycle() {
    if (this.running) return;
    this.running = true;
    try {
      this.sync();
      const cfg = this.getConfig();
      if (this.traders.size) this.mids = await hl.mids(cfg.dexes);
      for (const t of this.traders.values()) {
        try {
          await this.pollTrader(t, cfg);
          t.error = null;
        } catch (err) {
          t.error = String(err.message || err);
        }
      }
      this.lastCycle = Date.now();
      this.lastError = null;
    } catch (err) {
      this.lastError = String(err.message || err);
    } finally {
      this.running = false;
    }
  }

  async pollTrader(t, cfg) {
    if (Date.now() - t.spotAt > 5 * 60000) {
      try {
        t.spotUsd = await hl.spotUsd(t.address);
      } catch (_) {
        /* saldo spot jest tylko uzupełnieniem */
      }
      t.spotAt = Date.now();
    }
    const snap = await hl.accountSnapshot(t.address, cfg.dexes);
    const equity = snap.perpEquity + t.spotUsd;
    const cur = new Map(snap.positions.map((p) => [p.coin, p]));
    // Porównujemy z ostatnim zgłoszonym stanem, nie z poprzednim odczytem,
    // żeby seria małych dokupień w końcu przekroczyła próg i dała alert.
    // Po dłuższej przerwie (zamknięta przeglądarka) zaczynamy od nowego stanu zamiast zasypywać starymi zmianami.
    const stale = t.lastPoll && Date.now() - t.lastPoll > 10 * 60000;
    const prev = stale ? null : t.reported;
    const totalNotional = snap.positions.reduce((s, p) => s + p.value, 0);

    if (prev) {
      const coins = new Set([...prev.keys(), ...cur.keys()]);
      for (const coin of coins) {
        const a = prev.get(coin);
        const b = cur.get(coin);
        const before = a ? a.szi : 0;
        const after = b ? b.szi : 0;
        if (before === after) continue;
        const ref = Math.max(Math.abs(before), Math.abs(after));
        const opened = before === 0;
        const closedPos = after === 0;
        // Drobne korekty (poniżej 2% pozycji) pomijamy, żeby nie zasypywać alertami.
        if (!opened && !closedPos && Math.abs(after - before) / ref < 0.02) continue;

        let type;
        if (opened) type = 'OTWARCIE';
        else if (closedPos) type = 'ZAMKNIĘCIE';
        else if (before * after < 0) type = 'ODWRÓCENIE';
        else if (Math.abs(after) > Math.abs(before)) type = 'ZWIĘKSZENIE';
        else type = 'REDUKCJA';

        const px = b ? b.markPx : this.mids[coin] || (a ? a.markPx : 0);
        const valueAfter = b ? b.value : 0;
        const sug = suggest(valueAfter, equity, totalNotional, cfg, this.alloc());
        if (b) prev.set(coin, b);
        else prev.delete(coin);
        this.onEvent({
          ts: Date.now(),
          address: t.address,
          label: t.label,
          coin,
          type,
          side: (closedPos ? before : after) > 0 ? 'LONG' : 'SHORT',
          px,
          deltaUsd: Math.abs(after - before) * px,
          valueAfter,
          traderEquity: equity,
          share: sug.share,
          leverage: b ? b.leverage : a ? a.leverage : null,
          liqPx: b ? b.liqPx : null,
          entryPx: b ? b.entryPx : a ? a.entryPx : null,
          myTargetUsd: closedPos ? 0 : sug.usd,
          note: closedPos ? '' : sug.note,
        });
      }
    }
    if (!prev) t.reported = new Map(cur);
    t.positions = cur;
    t.perpEquity = snap.perpEquity;
    t.equity = equity;
    t.totalNotional = totalNotional;
    t.lastPoll = Date.now();
  }

  // Zapis i odtworzenie stanu: proces w tle wtyczki jest usypiany przez przeglądarkę między odczytami.
  dump() {
    return {
      lastCycle: this.lastCycle,
      traders: [...this.traders.values()].map((t) => ({
        ...t,
        positions: t.positions ? [...t.positions.values()] : null,
        reported: t.reported ? [...t.reported.values()] : null,
      })),
    };
  }

  restore(d) {
    if (!d) return;
    this.lastCycle = d.lastCycle || 0;
    const toMap = (arr) => new Map(arr.map((p) => [p.coin, p]));
    for (const t of d.traders || []) {
      this.traders.set(t.address, { ...t, positions: t.positions ? toMap(t.positions) : null, reported: t.reported ? toMap(t.reported) : null });
    }
  }

  view() {
    const cfg = this.getConfig();
    const alloc = this.alloc();
    const out = [];
    for (const t of this.traders.values()) {
      const positions = t.positions
        ? [...t.positions.values()]
            .sort((a, b) => b.value - a.value)
            .map((p) => {
              const s = suggest(p.value, t.equity, t.totalNotional, cfg, alloc);
              return { ...p, share: s.share, myUsd: s.usd, note: s.note };
            })
        : [];
      out.push({
        address: t.address,
        label: t.label,
        equity: t.equity || 0,
        effLeverage: t.equity > 0 ? t.totalNotional / t.equity : 0,
        lastPoll: t.lastPoll,
        error: t.error,
        positions,
      });
    }
    return out;
  }
}

export { Monitor, suggest };
