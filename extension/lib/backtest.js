// Symulacja: co by było, gdybyśmy kopiowali tradera proporcjonalnie do naszego kapitału.
// Uproszczenia (wszystkie zawyżają wynik względem rzeczywistości albo są neutralne):
//  - wchodzimy po cenie tradera plus poślizg, bez modelowania opóźnienia,
//  - nie liczymy fundingu,
//  - likwidacja następuje dopiero przy kapitale równym zero.


const BUCKET_MS = 60000;

function equityAt(timeline, t) {
  // timeline rosnąco po czasie; bierzemy ostatnią znaną wartość nie późniejszą niż t
  let lo = 0;
  let hi = timeline.length - 1;
  if (hi < 0) return 0;
  if (t <= timeline[0][0]) return timeline[0][1];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (timeline[mid][0] <= t) lo = mid;
    else hi = mid - 1;
  }
  return timeline[lo][1];
}

function mergeTimeline(portfolio) {
  const pts = new Map();
  for (const key of ['allTime', 'month', 'week', 'day']) {
    const h = portfolio[key];
    if (!h) continue;
    for (const [t, v] of h.accountValue) if (v > 0) pts.set(t, v);
  }
  return [...pts.entries()].sort((a, b) => a[0] - b[0]);
}

function simulate(fills, portfolio, cfg, capital, currentMids) {
  const timeline = mergeTimeline(portfolio);
  const res = {
    ok: false,
    capital,
    orders: 0,
    skippedSmall: 0,
    cappedByLeverage: 0,
    fees: 0,
    busted: false,
    curve: [],
  };
  if (!fills.length || !timeline.length) {
    res.reason = 'Za mało danych do symulacji.';
    return res;
  }
  const feeRate = cfg.feeBps / 10000;
  const slip = cfg.slippageBps / 10000;

  const traderPos = new Map(); // coin -> wielkość pozycji tradera
  const active = new Set(); // monety, w których trader zaczął pozycję od zera w badanym okresie
  const lastPx = new Map();
  const mine = new Map(); // coin -> { sz, entry }
  let realized = 0;
  let peak = capital;
  let maxDd = 0;

  const myEquity = () => {
    let u = 0;
    for (const [coin, p] of mine) u += p.sz * ((lastPx.get(coin) || p.entry) - p.entry);
    return capital + realized - res.fees + u;
  };

  const trade = (coin, delta, px) => {
    const execPx = px * (1 + Math.sign(delta) * slip);
    const p = mine.get(coin) || { sz: 0, entry: 0 };
    if (p.sz === 0 || Math.sign(p.sz) === Math.sign(delta)) {
      const total = p.sz + delta;
      p.entry = (p.entry * Math.abs(p.sz) + execPx * Math.abs(delta)) / Math.abs(total);
      p.sz = total;
    } else {
      const closing = Math.min(Math.abs(delta), Math.abs(p.sz));
      realized += closing * (execPx - p.entry) * Math.sign(p.sz);
      const rest = p.sz + delta;
      if (Math.sign(rest) !== Math.sign(p.sz) && rest !== 0) p.entry = execPx;
      p.sz = Math.abs(rest) < 1e-12 ? 0 : rest;
    }
    if (p.sz === 0) mine.delete(coin);
    else mine.set(coin, p);
    res.fees += Math.abs(delta) * execPx * feeRate;
    res.orders += 1;
  };

  const rebalance = (coin, t) => {
    const px = lastPx.get(coin);
    const tEq = equityAt(timeline, t);
    const eq = myEquity();
    if (!(tEq > 100) || !(eq > 0) || !px) return;
    let traderNotional = 0;
    for (const [c, sz] of traderPos) traderNotional += Math.abs(sz) * (lastPx.get(c) || 0);
    const traderLev = traderNotional / tEq;
    let scale = 1;
    if (traderLev > cfg.maxLeverage) {
      scale = cfg.maxLeverage / traderLev;
      res.cappedByLeverage += 1;
    }
    const target = (traderPos.get(coin) || 0) * (eq / tEq) * scale;
    const cur = mine.has(coin) ? mine.get(coin).sz : 0;
    const delta = target - cur;
    if (Math.abs(delta) * px < 1e-9) return;
    const closingAll = target === 0 && cur !== 0;
    if (!closingAll && Math.abs(delta) * px < cfg.minOrderUsd) {
      res.skippedSmall += 1;
      return;
    }
    trade(coin, delta, px);
  };

  let i = 0;
  const startTime = fills[0].time;
  const endTime = fills[fills.length - 1].time;
  while (i < fills.length && !res.busted) {
    const bucketEnd = fills[i].time + BUCKET_MS;
    const changed = new Set();
    while (i < fills.length && fills[i].time < bucketEnd) {
      const f = fills[i];
      const before = f.startPosition;
      const after = before + f.signed;
      if (Math.abs(before) < 1e-12) active.add(f.coin);
      traderPos.set(f.coin, Math.abs(after) < 1e-12 ? 0 : after);
      lastPx.set(f.coin, f.px);
      if (active.has(f.coin)) changed.add(f.coin);
      i++;
    }
    const t = fills[i - 1].time;
    for (const coin of changed) rebalance(coin, t);
    const eq = myEquity();
    if (eq <= 0) {
      res.busted = true;
      res.curve.push([t, 0]);
      break;
    }
    peak = Math.max(peak, eq);
    maxDd = Math.max(maxDd, (peak - eq) / peak);
    res.curve.push([t, eq]);
  }

  // Otwarte pozycje wyceniamy po bieżącej cenie rynkowej.
  if (!res.busted && currentMids) {
    for (const coin of mine.keys()) if (currentMids[coin]) lastPx.set(coin, currentMids[coin]);
    const eq = Math.max(0, myEquity());
    res.curve.push([Date.now(), eq]);
    peak = Math.max(peak, eq);
    maxDd = Math.max(maxDd, (peak - eq) / peak);
  }

  const finalEq = res.busted ? 0 : res.curve[res.curve.length - 1][1];
  const traderStartEq = equityAt(timeline, startTime);
  const traderRealized = fills.reduce((s, f) => s + f.closedPnl - f.fee, 0);

  res.ok = true;
  res.start = startTime;
  res.end = endTime;
  res.days = (endTime - startTime) / 86400000;
  res.finalEquity = finalEq;
  res.returnPct = finalEq / capital - 1;
  res.maxDrawdownPct = maxDd;
  res.traderReturnPct = traderStartEq > 100 ? traderRealized / traderStartEq : null;
  res.openPositions = mine.size;
  res.curve = downsample(res.curve, 240);
  return res;
}

function downsample(points, max) {
  if (points.length <= max) return points;
  const out = [];
  const step = (points.length - 1) / (max - 1);
  for (let k = 0; k < max; k++) out.push(points[Math.round(k * step)]);
  return out;
}

export { simulate };
