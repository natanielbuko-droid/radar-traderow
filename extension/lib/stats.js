// Statystyki tradera liczone z historii transakcji i historii konta.


const EPS = 1e-9;
const isZero = (x, ref) => Math.abs(x) <= Math.max(EPS, Math.abs(ref || 0) * 1e-6);

// Epizod = pozycja od otwarcia (z zera) do pełnego zamknięcia lub odwrócenia.
function buildEpisodes(fills) {
  const open = new Map();
  const closed = [];
  for (const f of fills) {
    const before = f.startPosition;
    const after = before + f.signed;
    let ep = open.get(f.coin);
    if (!ep) {
      const fromZero = isZero(before, f.sz);
      ep = {
        coin: f.coin,
        side: (fromZero ? after : before) > 0 ? 'LONG' : 'SHORT',
        openTime: f.time,
        pnl: 0,
        fees: 0,
        maxNotional: 0,
        // Pozycja istniała przed początkiem pobranej historii: wynik jest niepełny.
        partial: !fromZero,
      };
      open.set(f.coin, ep);
    }
    ep.pnl += f.closedPnl;
    ep.fees += f.fee;
    ep.maxNotional = Math.max(ep.maxNotional, Math.abs(before) * f.px, Math.abs(after) * f.px);
    const flipped = before * after < 0 && !isZero(before, f.sz) && !isZero(after, f.sz);
    if (isZero(after, f.sz) || flipped) {
      ep.closeTime = f.time;
      closed.push(ep);
      open.delete(f.coin);
      if (flipped) {
        open.set(f.coin, {
          coin: f.coin,
          side: after > 0 ? 'LONG' : 'SHORT',
          openTime: f.time,
          pnl: 0,
          fees: 0,
          maxNotional: Math.abs(after) * f.px,
          partial: false,
        });
      }
    }
  }
  return { closed, stillOpen: [...open.values()] };
}

const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

function maxDrawdown(pnlSeries, valueSeries) {
  let peak = -Infinity;
  let peakIdx = 0;
  let worst = 0;
  let worstPct = 0;
  pnlSeries.forEach(([, v], i) => {
    if (v > peak) {
      peak = v;
      peakIdx = i;
    }
    const dd = peak - v;
    if (dd > worst) {
      worst = dd;
      // Wartość konta w szczycie; gdy jej brak, bierzemy najwyższą znaną do tego momentu.
      let base = valueSeries[peakIdx] ? valueSeries[peakIdx][1] : 0;
      if (!(base > 0)) for (let k = 0; k <= i && k < valueSeries.length; k++) base = Math.max(base, valueSeries[k][1]);
      // Wynik powyżej 100% oznacza, że wpłaty i wypłaty zaburzyły porównanie: wtedy pokazujemy tylko kwotę.
      worstPct = base > 0 && dd / base <= 1 ? dd / base : 0;
    }
  });
  return { usd: worst, pct: worstPct };
}

function analyze(fills, portfolio, truncated) {
  const { closed, stillOpen } = buildEpisodes(fills);
  const full = closed.filter((e) => !e.partial);
  const net = (e) => e.pnl - e.fees;
  const wins = full.filter((e) => net(e) > 0);
  const losses = full.filter((e) => net(e) <= 0);
  const grossWin = sum(wins.map(net));
  const grossLoss = Math.abs(sum(losses.map(net)));
  const holds = full.map((e) => (e.closeTime - e.openTime) / 3600000);
  const shorts = full.filter((e) => e.side === 'SHORT');
  const longs = full.filter((e) => e.side === 'LONG');

  const byCoin = new Map();
  for (const e of full) {
    const c = byCoin.get(e.coin) || { coin: e.coin, pnl: 0, trades: 0 };
    c.pnl += net(e);
    c.trades += 1;
    byCoin.set(e.coin, c);
  }
  const coins = [...byCoin.values()].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 8);

  const spanDays = fills.length ? (fills[fills.length - 1].time - fills[0].time) / 86400000 : 0;
  const medianHold = median(holds);
  const style = !full.length ? 'brak danych' : medianHold < 1 ? 'skalper / bot' : medianHold < 24 ? 'intraday' : 'swing';

  const all = portfolio.allTime || { pnl: [], accountValue: [] };
  const month = portfolio.month || { pnl: [], accountValue: [] };
  const ddAll = maxDrawdown(all.pnl, all.accountValue);
  const ddMonth = maxDrawdown(month.pnl, month.accountValue);
  const firstTs = all.pnl.length ? all.pnl[0][0] : null;

  const m = {
    fills: fills.length,
    truncated,
    spanDays,
    fillsPerDay: spanDays > 0 ? fills.length / spanDays : fills.length,
    trades: full.length,
    openNow: stillOpen.length,
    winRate: full.length ? wins.length / full.length : 0,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    payoff: wins.length && losses.length ? grossWin / wins.length / (grossLoss / losses.length) : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    netPnl: grossWin - grossLoss,
    feesPaid: sum(closed.map((e) => e.fees)),
    medianHoldHours: medianHold,
    style,
    shortShare: full.length ? shorts.length / full.length : 0,
    pnlShort: sum(shorts.map(net)),
    pnlLong: sum(longs.map(net)),
    coins,
    drawdownAll: ddAll,
    drawdownMonth: ddMonth,
    historyDays: firstTs ? (Date.now() - firstTs) / 86400000 : 0,
    pnlAllTime: all.pnl.length ? all.pnl[all.pnl.length - 1][1] : 0,
    pnlMonth: month.pnl.length ? month.pnl[month.pnl.length - 1][1] : 0,
  };
  if (!Number.isFinite(m.profitFactor)) m.profitFactor = 99;
  m.warnings = warnings(m);
  return m;
}

function warnings(m) {
  const w = [];
  if (m.fills === 0) {
    w.push('Brak transakcji w badanym okresie: trader nie handluje albo trzyma stare pozycje bez zmian. Nie ma ruchów do kopiowania.');
    return w;
  }
  if (m.trades < 20) w.push(`Mała próba: tylko ${m.trades} zamkniętych pozycji w pobranej historii, wynik może być przypadkiem.`);
  if (m.style === 'skalper / bot') w.push('Pozycje trzyma krócej niż godzinę. Kopiowanie z opóźnieniem i prowizją prawie na pewno da gorszy wynik niż jego.');
  if (m.fillsPerDay > 150) w.push(`Bardzo dużo transakcji (${Math.round(m.fillsPerDay)} dziennie): to raczej automat albo animator rynku, nie do kopiowania ręcznie.`);
  if (m.winRate > 0.6 && m.payoff > 0 && m.payoff < 0.7) w.push('Wygrywa często, ale średnia strata jest wyraźnie większa od średniej wygranej. Wysoka skuteczność tu nie znaczy zysku.');
  if (m.profitFactor < 1 && m.trades >= 5) w.push('W pobranej historii stracił więcej, niż zarobił (po prowizjach).');
  if (m.drawdownAll.pct > 0.4) w.push(`Miał obsunięcie rzędu ${Math.round(m.drawdownAll.pct * 100)}% konta. Przy małym kapitale takie obsunięcie zwykle kończy się likwidacją.`);
  if (m.historyDays && m.historyDays < 60) w.push(`Krótka historia konta (${Math.round(m.historyDays)} dni).`);
  if (m.pnlAllTime < 0) w.push('Od początku istnienia konta jest na minusie.');
  if (m.truncated) w.push('Trader ma więcej transakcji, niż API udostępnia. Statystyki obejmują tylko część okresu.');
  return w;
}

export { analyze, buildEpisodes };
