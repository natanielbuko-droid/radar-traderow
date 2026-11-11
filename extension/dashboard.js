'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);
const nf = (x, d = 0) => Number(x).toLocaleString('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d });
function usd(x, exact) {
  const a = Math.abs(x), s = x < 0 ? '−' : '';
  if (!exact && a >= 1e9) return s + '$' + nf(a / 1e9, 2) + ' mld';
  if (!exact && a >= 1e6) return s + '$' + nf(a / 1e6, 2) + ' mln';
  if (!exact && a >= 1e4) return s + '$' + nf(a / 1e3, 1) + ' tys.';
  return s + '$' + nf(a, a < 1000 ? 2 : 0);
}
const pct = (x, d = 1) => (x < 0 ? '−' : '') + nf(Math.abs(x) * 100, d) + '%';
const signCls = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');
const px = (x) => (x >= 1000 ? nf(x, 0) : x >= 1 ? nf(x, 2) : Number(x).toPrecision(4));
function ago(ts) {
  if (!ts) return 'nigdy';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'przed chwilą';
  if (s < 3600) return Math.round(s / 60) + ' min temu';
  if (s < 86400) return Math.round(s / 3600) + ' godz. temu';
  return Math.round(s / 86400) + ' dni temu';
}
const clock = (ts) => new Date(ts).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const hhmm = (ts) => new Date(ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
function dayLabel(ts) {
  const d = new Date(ts), now = new Date(), y = new Date();
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Dzisiaj';
  if (d.toDateString() === y.toDateString()) return 'Wczoraj';
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });
}
const hyperdash = (a) => `https://hyperdash.com/address/${a}`;

// ---------- drobne elementy wizualne ----------
const ICONS = {
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.500 20c.600-3.600 3.200-5.500 6.500-5.500s5.900 1.900 6.500 5.500"/><path d="M16 4.800a3.500 3.500 0 0 1 0 6.400M18.500 14.900c1.700.800 2.700 2.500 3 5.100"/>',
  bars: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
  news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/>',
  sliders: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.500"/><circle cx="8" cy="17" r="2.500"/>',
  up: '<path d="M7 17 17 7M9 7h8v8"/>',
  down: '<path d="M7 7l10 10M17 9v8H9"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2.500"/><path d="M3 10h18M16 14.500h2"/>',
  eye: '<path d="M2 12s3.600-7 10-7 10 7 10 7-3.600 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  scale: '<path d="M12 4v16M5 20h14M5 8h14M5 8l-2.500 6a3 3 0 0 0 5 0L5 8zM19 8l-2.500 6a3 3 0 0 0 5 0L19 8z"/>',
  chart: '<path d="M4 19h16M6 15l4-4 3 3 5-6"/>',
  ext: '<path d="M14 5h5v5M19 5l-8 8M11 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.500l2.800 2.800L16 9.500"/>',
  alert: '<path d="M12 3.500 2.500 20h19L12 3.500z"/><path d="M12 10v4.500M12 17.300v.200"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.500"/><circle cx="12" cy="12" r=".800" fill="currentColor"/>',
};
const ico = (name, size = 16) => `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
document.querySelectorAll('[data-ico]').forEach((el) => { el.outerHTML = ico(el.dataset.ico); });

function avatar(address, size = 32) {
  let h = 0;
  for (const c of address.slice(2, 12)) h = (h * 16 + parseInt(c, 16)) % 360;
  return `<span class="avatar" style="width:${size}px;height:${size}px;background:linear-gradient(135deg,hsl(${h} 62% 54%),hsl(${(h + 75) % 360} 56% 32%))"></span>`;
}
function coin(name) {
  const [dex, bare] = name.includes(':') ? name.split(':') : ['', name];
  return `<span class="coin"><i>${esc(bare.slice(0, 4))}</i>${esc(bare)}${dex ? `<small>${esc(dex)}</small>` : ''}</span>`;
}
const sideChip = (side) => `<span class="chip ${side === 'LONG' ? 'long' : 'short'}">${side}</span>`;
function split(longV, shortV) {
  const t = longV + shortV;
  if (!t) return '<span class="split"></span>';
  return `<span class="split">${longV ? `<i class="lg" style="width:${(longV / t) * 100}%"></i>` : ''}${shortV ? `<i class="sh" style="width:${(shortV / t) * 100}%"></i>` : ''}</span>`;
}
const meter = (frac) => `<span class="meter"><i style="width:${Math.max(0, Math.min(1, frac)) * 100}%"></i></span>`;
const RADAR = '<svg width="64" height="64" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="13" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="18" cy="18" r="7" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M18 18 L18 5 A13 13 0 0 1 29.3 11.500 Z" fill="currentColor" fill-opacity=".25"/><circle cx="18" cy="18" r="1.800" fill="currentColor"/></svg>';
const empty = (title, text, extra = '') => `<div class="card empty">${RADAR}<p><b>${title}</b></p><p>${text}</p>${extra}</div>`;
// Podmieniamy fragment strony tylko wtedy, gdy coś się zmieniło, żeby nie gubić kliknięć i przewijania.
const put = (id, html) => { const el = $(id); if (el._html !== html) { el._html = html; el.innerHTML = html; } };

// Panel działa w trzech trybach: jako strona wtyczki (rozmawia z procesem w tle), lokalnie (rozmawia z server.js)
// albo jako zwykła strona internetowa, gdzie cały bot działa w tej karcie.
const EXT = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
const MODE = EXT ? 'ext' : document.documentElement.dataset.mode === 'local' ? 'local' : 'web';
const webCore = MODE === 'web' ? import('./lib/web.js').then((m) => m.core) : null;
async function api(path, body) {
  const u = new URL(path, 'http://x');
  const q = Object.fromEntries(u.searchParams);
  const msg = { type: u.pathname.replace('/api/', ''), q, ...(body || {}) };
  if (q.address) msg.address = q.address;
  let data;
  if (MODE === 'ext') data = await chrome.runtime.sendMessage(msg);
  else if (MODE === 'local') data = await fetch('/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) }).then((r) => r.json());
  else data = await (await webCore).handle(msg);
  if (!data) throw new Error('Brak odpowiedzi bota');
  if (data.error) throw new Error(data.error);
  return data;
}

let state = null, activeTab = 'live', lastEventTs = 0, settingsFilled = false;

// ---------- zakładki ----------
function openTab(name) {
  activeTab = name;
  document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('on', x.dataset.tab === name));
  document.querySelectorAll('main > section').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + name));
  if (name === 'traders') loadCandidates();
  if (name === 'market') loadMarket();
  if (name === 'news') loadNews();
}
$('nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) openTab(b.dataset.tab); });

// ---------- na żywo ----------
const isSkip = (note) => !!note && note.startsWith('poniżej');
function mineHtml(v, note, compact) {
  if (isSkip(note)) return `<span class="amt dim num">${usd(v, true)}</span><span class="chip" title="${esc(note)}">${compact ? 'pominąć' : esc(note) + ' · pominąć'}</span>`;
  return `<span class="amt num">${usd(v, true)}</span>${note ? `<span class="chip warn">${esc(note)}</span>` : ''}`;
}
function renderLive() {
  const s = state, st = s.status;
  const stale = !st.lastCycle || Date.now() - st.lastCycle > 120000;
  const pill = $('livePill');
  pill.className = 'live' + (st.monitorError ? ' bad' : s.traders.length && !stale ? ' on' : '');
  $('liveText').textContent = st.monitorError ? 'Błąd odczytu' : !s.traders.length ? 'Brak obserwowanych' : stale ? 'Czekam na odczyt…' : 'Na żywo';
  pill.title = st.monitorError || (st.lastCycle ? 'Ostatni odczyt pozycji: ' + clock(st.lastCycle) : '');

  // kafle podsumowania
  const allPos = s.traders.flatMap((t) => t.positions);
  const longUsd = allPos.filter((p) => p.side === 'LONG').reduce((a, p) => a + p.value, 0);
  const shortUsd = allPos.filter((p) => p.side === 'SHORT').reduce((a, p) => a + p.value, 0);
  const dayEvents = s.events.filter((e) => Date.now() - e.ts < 86400000);
  $('cntLive').textContent = dayEvents.length ? (dayEvents.length > 99 ? '99+' : dayEvents.length) : '';
  const kpi = (icon, k, v, sub) => `<div class="kpi"><div class="k">${ico(icon, 15)}${k}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`;
  put('kpis',
    kpi('eye', 'Obserwowani traderzy', s.traders.length, `${allPos.length} otwartych pozycji`) +
    kpi('wallet', 'Nasz kapitał', usd(s.config.capitalUsd, true), `${usd(s.alloc, true)} na tradera · dźwignia do ${nf(s.config.maxLeverage, 1)}×`) +
    kpi('pulse', 'Ruchy z ostatnich 24 godz.', dayEvents.length, s.events.length ? `ostatni ${ago(s.events[0].ts)}` : 'jeszcze żadnego') +
    `<div class="kpi"><div class="k">${ico('scale', 15)}Ekspozycja obserwowanych</div>${allPos.length
      ? `${split(longUsd, shortUsd)}<div class="s"><span class="pos">Long ${usd(longUsd)}</span> · <span class="neg">Short ${usd(shortUsd)}</span></div>`
      : `<div class="v">—</div><div class="s">brak otwartych pozycji</div>`}</div>`);

  // lista ruchów
  let evs = s.events;
  if ($('evOnlyCopy').checked) evs = evs.filter((e) => e.type === 'ZAMKNIĘCIE' || !isSkip(e.note));
  let lastDay = '';
  put('events', evs.length ? evs.map((e) => {
    const day = dayLabel(e.ts);
    const sep = day !== lastDay ? `<div class="day">${day}</div>` : '';
    lastDay = day;
    const closing = e.type === 'ZAMKNIĘCIE';
    const who = e.label ? `<b>${esc(e.label)}</b> <span class="muted">${short(e.address)}</span>` : short(e.address);
    const meta = closing
      ? `Zamknął pozycję wartą ${usd(e.deltaUsd)} po ${px(e.px)}`
      : `Ruch ${usd(e.deltaUsd)} po ${px(e.px)} · ${pct(e.share)} jego konta · dźwignia ${e.leverage ? e.leverage + '×' : '?'}`;
    return `${sep}<article class="ev ${e.side === 'LONG' ? 'long' : 'short'}${!closing && isSkip(e.note) ? ' skip' : ''}">
      <div class="ev-ico">${ico(closing ? 'x' : e.side === 'LONG' ? 'up' : 'down', 18)}</div>
      <div class="ev-body">
        <div class="ev-top"><span class="ev-title">${e.side} ${esc(e.coin)}</span><span class="chip">${esc(e.type)}</span><span class="ev-time">${hhmm(e.ts)}</span></div>
        <div class="ev-who">${avatar(e.address, 16)}${who}</div>
        <div class="ev-meta">${meta}</div>
        <div class="ev-mine">U nas docelowo ${closing ? '<span class="amt">zamknąć pozycję</span>' : mineHtml(e.myTargetUsd, e.note)}</div>
      </div></article>`;
  }).join('') : s.events.length
    ? empty('Brak ruchów do skopiowania', 'Wszystkie dotychczasowe ruchy były poniżej minimalnego zlecenia. Wyłącz filtr, żeby zobaczyć pełną listę.')
    : empty('Jeszcze nic się nie wydarzyło', 'Alert pojawi się tutaj, gdy obserwowany trader otworzy, zmieni albo zamknie pozycję.'));

  // obserwowani traderzy
  put('traders', s.traders.length ? s.traders.map((t) => {
    const lg = t.positions.filter((p) => p.side === 'LONG').reduce((a, p) => a + p.value, 0);
    const sh = t.positions.filter((p) => p.side === 'SHORT').reduce((a, p) => a + p.value, 0);
    const upnl = t.positions.reduce((a, p) => a + p.unrealizedPnl, 0);
    const rows = t.positions.map((p) => `<tr>
      <td>${coin(p.coin)}</td><td class="l">${sideChip(p.side)}</td><td>${usd(p.value)}</td>
      <td><span class="share">${pct(p.share)}${meter(p.share)}</span></td>
      <td class="l"><span class="mine-cell">${mineHtml(p.myUsd, p.note, true)}</span></td>
      <td>${p.leverage ? p.leverage + '×' : '—'}</td><td>${px(p.entryPx)}</td><td>${p.liqPx ? px(p.liqPx) : '—'}</td>
      <td class="${signCls(p.unrealizedPnl)}">${usd(p.unrealizedPnl)}</td></tr>`).join('');
    const staleNote = t.lastPoll && Date.now() - t.lastPoll > 90000 ? `<span class="chip warn">dane sprzed ${Math.round((Date.now() - t.lastPoll) / 60000)} min</span>` : '';
    return `<div class="card">
      <div class="tr-head">${avatar(t.address, 40)}
        <div><div class="tr-name">${t.label ? esc(t.label) : short(t.address)}</div><a class="small" href="${hyperdash(t.address)}" target="_blank" rel="noopener">${t.label ? short(t.address) : 'Profil na Hyperdash'} ${ico('ext', 12)}</a></div>
        ${staleNote}${t.error ? `<span class="chip warn" title="${esc(t.error)}">błąd odczytu</span>` : ''}<span class="grow"></span>
        <button class="btn sm" data-analyze="${t.address}">${ico('chart', 14)}Analiza</button><button class="btn sm ghost danger" data-unwatch="${t.address}" title="Przestań obserwować">${ico('x', 14)}</button></div>
      <div class="tr-stats">
        <div><span>Wartość konta</span><b>${usd(t.equity)}</b></div>
        <div><span>Łączna dźwignia</span><b>${nf(t.effLeverage, 2)}×</b></div>
        <div><span>Pozycje</span><b>${t.positions.length}</b></div>
        <div><span>Wynik otwartych</span><b class="${signCls(upnl)}">${usd(upnl)}</b></div>
      </div>
      ${t.positions.length ? `<div class="expo"><span class="pos">Long ${usd(lg)}</span>${split(lg, sh)}<span class="neg">Short ${usd(sh)}</span></div>
        <div class="scroll"><table><thead><tr><th>Rynek</th><th class="l">Kierunek</th><th>Wartość</th><th>Udział w koncie</th><th class="l">U nas</th><th>Dźw.</th><th>Wejście</th><th>Likwidacja</th><th>Wynik</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<div class="muted small">${t.lastPoll ? 'Brak otwartych pozycji. Alert pojawi się przy pierwszym ruchu.' : 'Pobieram pozycje…'}</div>`}
    </div>`;
  }).join('') : empty('Nie obserwujesz jeszcze żadnego tradera', 'Wybierz kandydata z rankingu, sprawdź go analizą i dodaj do obserwowanych.', '<button class="btn primary" data-goto="traders">Przejdź do rankingu</button>'));

  const newest = s.events.length ? s.events[0].ts : 0;
  if (!EXT && lastEventTs && newest > lastEventTs && window.Notification && Notification.permission === 'granted') {
    for (const e of s.events.filter((x) => x.ts > lastEventTs).slice(0, 3)) new Notification(`${e.type} ${e.side} ${e.coin}`, { body: e.text });
  }
  lastEventTs = Math.max(lastEventTs, newest) || Date.now();
  if (!settingsFilled) fillSettings();
}
$('evOnlyCopy').addEventListener('change', () => state && renderLive());

let seenTs = 0;
async function tick() {
  try {
    state = await api('/api/state');
    renderLive();
    // Otwarty i widoczny panel kasuje licznik nowych ruchów na ikonie wtyczki.
    const newest = state.events.length ? state.events[0].ts : 1;
    if (EXT && document.visibilityState === 'visible' && newest !== seenTs) { seenTs = newest; chrome.runtime.sendMessage({ type: 'seen' }); }
  } catch (err) {
    $('livePill').className = 'live bad';
    $('liveText').textContent = 'Brak połączenia z botem';
    $('livePill').title = err.message;
  }
}

if (MODE === 'web') $('webNote').hidden = false;

// ---------- dodatki dostępne tylko we wtyczce ----------
if (EXT) {
  $('notifBtn').hidden = true; // powiadomienia systemowe wysyła proces w tle
  $('bgNote').hidden = false;
  chrome.tabs.getCurrent().then(async (tab) => {
    if (!tab) return; // jesteśmy już w panelu bocznym
    const win = await chrome.windows.getCurrent();
    $('sideBtn').hidden = false;
    $('sideBtn').addEventListener('click', () => chrome.sidePanel.open({ windowId: win.id }));
  });
  // W panelu bocznym podpowiadamy portfel z otwartej strony Hyperdash.
  const detect = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const m = tab && tab.url && /hyperdash\.com/.test(tab.url) ? tab.url.match(/0x[0-9a-fA-F]{40}/) : null;
      $('hint').innerHTML = m ? `<div class="card row">${avatar(m[0].toLowerCase(), 28)}<span>Na otwartej stronie Hyperdash jest portfel <b>${short(m[0])}</b>.</span><span class="grow"></span><button class="btn primary" data-analyze="${m[0].toLowerCase()}">${ico('chart', 14)}Analiza</button></div>` : '';
    } catch (_) { $('hint').innerHTML = ''; }
  };
  chrome.tabs.onActivated.addListener(detect);
  chrome.tabs.onUpdated.addListener((id, info) => { if (info.url || info.status === 'complete') detect(); });
  detect();
}

$('notifBtn').addEventListener('click', async () => {
  if (!window.Notification) return;
  const p = await Notification.requestPermission();
  $('notifBtn').textContent = p === 'granted' ? 'Powiadomienia włączone' : 'Powiadomienia zablokowane';
});
document.body.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-analyze]');
  const w = e.target.closest('[data-watch]');
  const u = e.target.closest('[data-unwatch]');
  const g = e.target.closest('[data-goto]');
  if (g) openTab(g.dataset.goto);
  if (a) { openTab('traders'); analyze(a.dataset.analyze); }
  if (w) { await api('/api/watch', { address: w.dataset.watch, label: w.dataset.label || '' }); await tick(); loadCandidates(); if (currentDetail) renderDetail(currentDetail); }
  if (u) { await api('/api/watch', { address: u.dataset.unwatch, remove: true }); await tick(); if (activeTab === 'traders') loadCandidates(); if (currentDetail) renderDetail(currentDetail); }
});

// ---------- traderzy ----------
async function loadCandidates() {
  const q = new URLSearchParams({ window: $('fWindow').value, sort: $('fSort').value, minAv: $('fMinAv').value, maxTurnover: $('fTurnover').value });
  try {
    const d = await api('/api/candidates?' + q);
    const win = $('fWindow').value;
    const maxTurn = Number($('fTurnover').value) || 60;
    const waiting = d.loading && !d.rows.length;
    $('candInfo').textContent = waiting ? '' : d.error ? 'Błąd rankingu: ' + d.error : `stan z ${clock(d.at)} · sam zysk nie mówi, czy tradera da się kopiować`;
    if (waiting) {
      $('cands').innerHTML = `<tbody><tr><td class="empty">${RADAR}<p><b>Pobieram ranking Hyperliquid</b></p><p>To jeden duży plik (ok. 40 MB), potrwa do minuty.</p></td></tr></tbody>`;
      setTimeout(() => activeTab === 'traders' && loadCandidates(), 4000);
      return;
    }
    $('cands').innerHTML = `<thead><tr><th>Trader</th><th>Wartość konta</th><th>Zysk w okresie</th><th>Zwrot w okresie</th><th>Zysk 30 dni</th><th>Zysk od początku</th><th title="Miesięczny obrót podzielony przez wartość konta">Obrót / konto</th><th></th></tr></thead><tbody>` +
      d.rows.map((r, i) => `<tr>
        <td><span class="who"><span class="rank">${i + 1}</span>${avatar(r.address, 26)}<span>${r.name ? `<b>${esc(r.name)}</b><br>` : ''}<a class="${r.name ? 'small' : ''}" href="${hyperdash(r.address)}" target="_blank" rel="noopener">${short(r.address)}</a></span></span></td>
        <td>${usd(r.accountValue)}</td><td class="${signCls(r[win].pnl)}">${usd(r[win].pnl)}</td>
        <td><span class="chip ${r[win].roi >= 0 ? 'long' : 'short'}">${pct(r[win].roi)}</span></td>
        <td class="${signCls(r.month.pnl)}">${usd(r.month.pnl)}</td><td class="${signCls(r.allTime ? r.allTime.pnl : 0)}">${r.allTime ? usd(r.allTime.pnl) : '—'}</td>
        <td>${nf(r.turnover, 1)}×${meter(r.turnover / maxTurn)}</td>
        <td><button class="btn sm" data-analyze="${r.address}">${ico('chart', 14)}Analiza</button> ${r.watched
          ? `<button class="btn sm ghost danger" data-unwatch="${r.address}">Usuń</button>`
          : `<button class="btn sm ghost" data-watch="${r.address}" data-label="${esc(r.name || '')}">${ico('eye', 14)}Obserwuj</button>`}</td></tr>`).join('') + '</tbody>';
    if (!d.rows.length) $('cands').innerHTML = `<tbody><tr><td class="empty"><p><b>Żaden trader nie spełnia filtrów</b></p><p>Obniż minimalną wartość konta albo podnieś limit obrotu.</p></td></tr></tbody>`;
  } catch (err) { $('candInfo').innerHTML = `<span class="err">${esc(err.message)}</span>`; }
}
$('fApply').addEventListener('click', loadCandidates);
$('addAnalyze').addEventListener('click', () => { const a = $('addAddr').value.trim(); if (a) analyze(a); });
$('addAddr').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('addAnalyze').click(); });

let currentDetail = null;
async function analyze(address) {
  $('detail').innerHTML = `<div class="card empty">${RADAR}<p><b>Analizuję ${esc(short(address))}</b></p><p>Pobieram historię transakcji i liczę symulację kopiowania…</p></div>`;
  $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  try { currentDetail = await api('/api/trader?address=' + encodeURIComponent(address)); renderDetail(currentDetail); }
  catch (err) { $('detail').innerHTML = `<div class="card err">${esc(err.message)}</div>`; }
}
function ring(frac) {
  const c = 2 * Math.PI * 16, f = Math.max(0, Math.min(1, frac));
  return `<svg width="42" height="42" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="none" stroke="var(--surface-3)" stroke-width="4.5"/><circle cx="20" cy="20" r="16" fill="none" stroke="var(--accent)" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="${f * c} ${c}" transform="rotate(-90 20 20)"/></svg>`;
}
const money = (x) => `<span class="${signCls(x)}">${usd(x)}</span>`;
function tile(k, v, s, lead = '') { return `<div class="tile">${lead}<div><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div></div>`; }
function renderDetail(d) {
  const m = d.metrics, sim = d.sim;
  const watched = state && state.traders.some((t) => t.address === d.address);
  const name = d.leaderboard && d.leaderboard.name ? d.leaderboard.name : '';
  const hold = m.medianHoldHours < 1 ? nf(m.medianHoldHours * 60, 0) + ' min' : m.medianHoldHours < 48 ? nf(m.medianHoldHours, 1) + ' godz.' : nf(m.medianHoldHours / 24, 1) + ' dni';

  // Przy bardzo aktywnych kontach giełda oddaje tylko wycinek historii: pokazujemy, ile naprawdę obejmuje.
  const period = m.truncated
    ? `dostępna historia: ostatnie ${m.spanDays < 1 ? Math.max(1, Math.round(m.spanDays * 24)) + ' godz.' : Math.round(m.spanDays) + ' dni'}`
    : `ostatnie ${d.lookbackDays} dni`;
  // Bez choćby jednej w pełni zamkniętej pozycji nie ma z czego liczyć skuteczności: zamiast zer pokazujemy brak danych.
  const has = m.trades > 0;
  const na = (v, s) => (has ? [v, s] : ['—', 'za mało danych']);
  const hard = m.style === 'skalper / bot' || m.fillsPerDay > 150 || (m.profitFactor < 1 && m.trades >= 5) || m.fills === 0;
  const level = !m.warnings.length ? 'ok' : hard ? 'bad' : 'mid';
  const verdict = {
    ok: ['check', 'Brak zastrzeżeń w danych', 'To nie jest gwarancja wyniku, tylko brak sygnałów ostrzegawczych w badanym okresie.'],
    mid: ['alert', 'Są zastrzeżenia', ''],
    bad: ['alert', 'Raczej nie nadaje się do kopiowania', ''],
  }[level];

  let simHtml;
  if (!sim.ok) simHtml = `<p class="muted">${esc(sim.reason || 'Brak symulacji.')}</p>`;
  else if (!sim.orders) simHtml = `<p class="muted">W dostępnej historii trader nie otworzył żadnej nowej pozycji od zera${sim.skippedSmall ? ' powyżej minimalnego zlecenia' : ''}, więc symulacja nie miała czego skopiować. To nie znaczy, że kopiowanie dałoby zero: po prostu nie da się tego policzyć z tych danych.</p>`;
  else {
    simHtml = `<div class="sim-big"><span class="from">${usd(sim.capital, true)} →</span><span class="to ${sim.busted ? 'neg' : signCls(sim.returnPct)}">${sim.busted ? 'konto wyzerowane' : usd(sim.finalEquity, true)}</span>${sim.busted ? '' : `<span class="chip ${sim.returnPct >= 0 ? 'long' : 'short'}">${pct(sim.returnPct)}</span>`}</div>
      <div class="sim-stats"><span>Okres <b>${nf(sim.days, 0)} dni</b></span><span>Zleceń <b>${sim.orders}</b></span><span>Prowizje <b>${usd(sim.fees, true)}</b></span><span>Pominięte (poniżej minimum) <b>${sim.skippedSmall}</b></span><span>Największe obsunięcie <b>${pct(sim.maxDrawdownPct)}</b></span>${sim.traderReturnPct != null ? `<span>Wynik tradera <b>${pct(sim.traderReturnPct)}</b></span>` : ''}</div>
      <div class="chart" id="simChart"></div>
      <p class="muted small" style="margin-top:8px">Symulacja kopiuje tylko pozycje otwarte od zera w badanym okresie, po cenie tradera z poślizgiem. Nie liczy fundingu ani opóźnienia, więc prawdziwy wynik byłby raczej gorszy. Wynik z przeszłości nie przesądza o przyszłym.</p>`;
  }

  const maxCoin = Math.max(1, ...m.coins.map((c) => Math.abs(c.pnl)));
  // Oś zero na środku tylko wtedy, gdy są i zyski, i straty; inaczej słupki dostają całą szerokość.
  const mixed = m.coins.some((c) => c.pnl < 0) && m.coins.some((c) => c.pnl > 0);
  const coinsHtml = m.coins.length ? `<div class="bars${mixed ? '' : ' one'}">${m.coins.map((c) => `<span>${coin(c.coin)}</span>
      <span class="track"><i class="${c.pnl >= 0 ? 'p' : 'n'}" style="width:${(Math.abs(c.pnl) / maxCoin) * (mixed ? 50 : 100)}%"></i></span>
      <span class="num ${signCls(c.pnl)}" style="text-align:right">${usd(c.pnl)} <span class="muted">· ${c.trades}</span></span>`).join('')}</div>` : '<p class="muted small">Brak zamkniętych pozycji w badanym okresie.</p>';

  $('detail').innerHTML = `<div class="card">
    <div class="hero">${avatar(d.address, 48)}
      <div><h2>${name ? esc(name) : short(d.address)}</h2><div class="row small" style="margin-top:3px"><a href="${hyperdash(d.address)}" target="_blank" rel="noopener">${name ? short(d.address) : 'Profil na Hyperdash'} ${ico('ext', 12)}</a><span class="chip accent">${esc(m.style)}</span><span class="muted">${period} · ${nf(m.fills)} transakcji · ${m.trades} zamkniętych pozycji · ${m.openNow} otwartych</span></div></div>
      <span class="grow"></span>
      ${watched ? `<button class="btn danger" data-unwatch="${d.address}">Usuń z obserwowanych</button>` : `<button class="btn primary" data-watch="${d.address}" data-label="${esc(name)}">${ico('eye', 15)}Obserwuj</button>`}
      <button class="btn ghost" id="closeDetail" title="Zamknij analizę">${ico('x', 16)}</button></div>
    <div class="verdict ${level}">${ico(verdict[0], 20)}<div><b>${verdict[1]}</b>${verdict[2] ? `<span class="small" style="color:var(--text-2)">${verdict[2]}</span>` : ''}${m.warnings.length ? `<ul>${m.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}</div></div>
    <div class="tiles">
      ${tile('Skuteczność', ...na(pct(m.winRate, 0), `${m.trades} pozycji`), has ? ring(m.winRate) : '')}
      ${tile('Średnia wygrana / strata', ...na(`${usd(m.avgWin)} / ${usd(m.avgLoss)}`, `stosunek ${nf(m.payoff, 2)}`))}
      ${tile('Zysk do strat', ...na(m.profitFactor >= 99 ? 'bez strat' : nf(m.profitFactor, 2), 'powyżej 1 = na plusie'))}
      ${tile('Czas trzymania pozycji', ...na(hold, 'mediana'))}
      ${tile('Udział shortów', ...na(pct(m.shortShare, 0), `short ${usd(m.pnlShort)} · long ${usd(m.pnlLong)}`), has ? ring(m.shortShare) : '')}
      ${tile('Zrealizowany wynik', m.fills ? money(m.realizedPnl) : '—', m.fills ? `w dostępnej historii · prowizje ${usd(m.feesAll)}` : 'brak transakcji')}
      ${tile('Zysk z 7 dni', money(m.pnlWeek), 'według historii konta')}
      ${tile('Zysk z 30 dni', money(m.pnlMonth), 'według historii konta')}
      ${tile('Największe obsunięcie', m.drawdownAll.pct ? pct(m.drawdownAll.pct, 0) : usd(m.drawdownAll.usd), `${usd(m.drawdownAll.usd)} · cała historia`)}
      ${tile('Historia konta', nf(m.historyDays, 0) + ' dni', `zysk łączny ${usd(m.pnlAllTime)}`)}
    </div>
    <div class="cols">
      <div class="box"><h3>Gdybyśmy go kopiowali z ${usd(d.alloc, true)}</h3>${simHtml}</div>
      <div class="box"><h3>Wynik według rynków</h3>${coinsHtml}</div>
    </div></div>`;
  $('closeDetail').addEventListener('click', () => { currentDetail = null; $('detail').innerHTML = ''; });
  if ($('simChart') && sim.curve.length > 1) drawChart($('simChart'), sim.curve, sim.capital);
}

// Wykres liniowy jednej serii: nasz kapitał w czasie, z linią kapitału początkowego i podglądem wartości.
function drawChart(el, pts, base) {
  const W = Math.max(320, el.clientWidth), H = 230, L = 58, R = 72, T = 12, B = 26;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = xs[0], x1 = xs[xs.length - 1];
  let lo = Math.min(base, ...ys), hi = Math.max(base, ...ys);
  const pad = (hi - lo || base * 0.02) * 0.1; lo -= pad; hi += pad;
  const X = (t) => L + ((t - x0) / (x1 - x0 || 1)) * (W - L - R);
  const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
  const area = `${line} L${X(x1).toFixed(1)} ${H - B} L${X(x0).toFixed(1)} ${H - B} Z`;
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const day = (t) => new Date(t).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  const last = pts[pts.length - 1];
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Kapitał w symulacji kopiowania">
    <defs><linearGradient id="simFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3987e5" stop-opacity=".24"/><stop offset="1" stop-color="#3987e5" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--border)" stroke-width="1"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11.5" fill="var(--muted)">${usd(v, true)}</text>`).join('')}
    <path d="${area}" fill="url(#simFill)"/>
    <line x1="${L}" x2="${W - R}" y1="${Y(base)}" y2="${Y(base)}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="4 4"/>
    <text x="${L + 4}" y="${Y(base) - 5}" font-size="11.5" fill="var(--muted)">kapitał początkowy</text>
    <text x="${L}" y="${H - 6}" font-size="11.5" fill="var(--muted)">${day(x0)}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="11.5" fill="var(--muted)">${day(x1)}</text>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(last[0])}" cy="${Y(last[1])}" r="4" fill="var(--accent)" stroke="var(--surface-2)" stroke-width="2"/>
    <text x="${X(last[0]) + 8}" y="${Y(last[1]) + 4}" font-size="12" font-weight="600" fill="var(--text)">${usd(last[1], true)}</text>
    <line id="xh" y1="${T}" y2="${H - B}" stroke="var(--text-2)" stroke-width="1" visibility="hidden"/>
    <circle id="xd" r="4" fill="var(--accent)" stroke="var(--surface-2)" stroke-width="2" visibility="hidden"/>
    <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" id="hit"/></svg><div class="tip"></div>`;
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), xh = svg.querySelector('#xh'), xd = svg.querySelector('#xd');
  svg.querySelector('#hit').addEventListener('mousemove', (ev) => {
    const r = svg.getBoundingClientRect();
    const mx = ((ev.clientX - r.left) / r.width) * W;
    const t = x0 + ((mx - L) / (W - L - R)) * (x1 - x0);
    let k = 0; for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - t) < Math.abs(pts[k][0] - t)) k = i;
    const cx = X(pts[k][0]), cy = Y(pts[k][1]);
    xh.setAttribute('x1', cx); xh.setAttribute('x2', cx); xh.setAttribute('visibility', 'visible');
    xd.setAttribute('cx', cx); xd.setAttribute('cy', cy); xd.setAttribute('visibility', 'visible');
    tip.style.display = 'block';
    tip.innerHTML = `<b>${usd(pts[k][1], true)}</b> <span class="muted">${clock(pts[k][0])}</span>`;
    const left = (cx / W) * r.width;
    tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, left + 10)) + 'px';
    tip.style.top = Math.max(0, (cy / H) * r.height - 34) + 'px';
  });
  svg.querySelector('#hit').addEventListener('mouseleave', () => { tip.style.display = 'none'; xh.setAttribute('visibility', 'hidden'); xd.setAttribute('visibility', 'hidden'); });
}

// ---------- rynek ----------
let marketData = null;
async function loadMarket() {
  try { marketData = await api('/api/market'); renderMarket(); if (!marketData.at) setTimeout(() => activeTab === 'market' && loadMarket(), 5000); }
  catch (err) { $('marketInfo').innerHTML = `<span class="err">${esc(err.message)}</span>`; }
}
function renderMarket() {
  const d = marketData; if (!d) return;
  $('marketInfo').textContent = d.at ? `Pozycje ${d.scanned} traderów z czołówki rankingu · stan z ${clock(d.at)} · odświeżane co 15 min` : '';
  if (!d.at) { $('market').innerHTML = `<tbody><tr><td class="empty">${RADAR}<p><b>Skanuję pozycje czołówki rankingu</b></p><p>Pierwszy skan trwa około minuty.</p></td></tr></tbody>`; return; }
  let rows = d.coins.map((c) => ({ ...c, cons: d.consensus[c.coin] || { longs: 0, shorts: 0, longUsd: 0, shortUsd: 0, net: 0 } }));
  const term = $('mSearch').value.trim().toLowerCase();
  if (term) rows = rows.filter((r) => r.coin.toLowerCase().includes(term));
  else if ($('mFilter').value === 'top') rows = rows.filter((r) => r.cons.longs + r.cons.shorts > 0);
  const key = { net: (r) => Math.abs(r.cons.net), short: (r) => -r.cons.net, funding: (r) => Math.abs(r.funding), vol: (r) => r.volume24hUsd, chg: (r) => Math.abs(r.change24h) }[$('mSort').value];
  rows.sort((a, b) => key(b) - key(a));
  $('market').innerHTML = `<thead><tr><th>Rynek</th><th>Cena</th><th>24h</th><th title="Stawka za godzinę; dodatnia: longi płacą shortom">Funding / godz.</th><th>Otwarte pozycje</th><th>Wolumen 24h</th><th class="l">Czołówka: long / short</th><th>Wartość long / short</th><th class="l" title="Suma udziałów pozycji w kontach traderów">Przewaga</th></tr></thead><tbody>` +
    rows.slice(0, 150).map((r) => {
      const n = r.cons.longs + r.cons.shorts;
      const lean = r.cons.net > 0.05 ? 'LONG' : r.cons.net < -0.05 ? 'SHORT' : '';
      return `<tr><td>${coin(r.coin)}</td><td>${px(r.markPx)}</td><td><span class="chip ${r.change24h >= 0 ? 'long' : 'short'}">${pct(r.change24h)}</span></td><td class="${signCls(r.funding)}">${pct(r.funding, 4)}</td><td>${usd(r.openInterestUsd)}</td><td>${usd(r.volume24hUsd)}</td>
        <td class="l">${n ? `<span class="cons"><span class="pos num">${r.cons.longs}</span>${split(r.cons.longs, r.cons.shorts)}<span class="neg num">${r.cons.shorts}</span></span>` : '<span class="muted">—</span>'}</td>
        <td>${n ? `${usd(r.cons.longUsd)} / ${usd(r.cons.shortUsd)}` : '—'}</td><td class="l">${lean ? sideChip(lean) : '<span class="muted">—</span>'}</td></tr>`;
    }).join('') + '</tbody>';
  if (!rows.length) $('market').innerHTML = `<tbody><tr><td class="empty"><p><b>Brak rynków dla tego filtra</b></p></td></tr></tbody>`;
}
$('mFilter').addEventListener('change', renderMarket);
$('mSort').addEventListener('change', renderMarket);
$('mSearch').addEventListener('input', renderMarket);

// ---------- newsy ----------
let newsData = null;
async function loadNews() {
  try { newsData = await api('/api/news'); renderNews(); }
  catch (err) { $('newsInfo').innerHTML = `<span class="err">${esc(err.message)}</span>`; }
}
function renderNews() {
  const d = newsData; if (!d) return;
  if (MODE === 'web') {
    $('newsInfo').textContent = '';
    $('news').innerHTML = `<div class="card empty" style="grid-column:1/-1">${RADAR}<p><b>Newsy nie działają w wersji przeglądarkowej</b></p><p>Serwisy z wiadomościami nie pozwalają czytać swoich kanałów ze zwykłej strony. Nagłówki są dostępne we wtyczce i w wersji uruchamianej na komputerze.</p></div>`;
    return;
  }
  const held = new Set();
  if (state) for (const t of state.traders) for (const p of t.positions) held.add(p.coin.includes(':') ? p.coin.split(':')[1] : p.coin);
  let items = d.items;
  if ($('nFilter').value === 'held') items = items.filter((it) => it.coins.some((c) => held.has(c)));
  $('newsInfo').textContent = `${items.length} nagłówków · stan z ${clock(d.at || Date.now())}` + (d.errors.length ? ` · niedostępne źródła: ${d.errors.length}` : '');
  $('news').innerHTML = items.length ? items.map((it) => `<div class="news-item">
    <a href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a>
    <div class="meta">${it.coins.map((c) => `<span class="chip ${held.has(c) ? 'accent' : ''}">${esc(c)}</span>`).join('')}<span>${esc(it.source)}</span><span>·</span><span>${ago(it.ts)}</span></div></div>`).join('')
    : `<div class="card empty" style="grid-column:1/-1"><p><b>Brak nagłówków dla tego filtra</b></p><p>Obserwowani traderzy nie mają teraz pozycji na rynkach, o których piszą serwisy.</p></div>`;
}
$('nFilter').addEventListener('change', renderNews);

// ---------- ustawienia ----------
function fillSettings() {
  const c = state.config; settingsFilled = true;
  $('sCapital').value = c.capitalUsd; $('sLev').value = c.maxLeverage; $('sMin').value = c.minOrderUsd;
  $('sPoll').value = c.pollSeconds; $('sLook').value = c.lookbackDays; $('sSlip').value = c.slippageBps;
  $('sDiscord').value = c.discordWebhook; $('sTgToken').value = c.telegramToken; $('sTgChat').value = c.telegramChatId;
}
$('sSave').addEventListener('click', async () => {
  try {
    await api('/api/config', { capitalUsd: $('sCapital').value, maxLeverage: $('sLev').value, minOrderUsd: $('sMin').value, pollSeconds: $('sPoll').value, lookbackDays: $('sLook').value, slippageBps: $('sSlip').value, discordWebhook: $('sDiscord').value, telegramToken: $('sTgToken').value, telegramChatId: $('sTgChat').value });
    $('sMsg').textContent = 'Zapisano.'; settingsFilled = false; await tick();
  } catch (err) { $('sMsg').innerHTML = `<span class="err">${esc(err.message)}</span>`; }
});

tick();
setInterval(tick, 5000);
