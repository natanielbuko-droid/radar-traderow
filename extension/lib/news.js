// Nagłówki z darmowych kanałów RSS, oznaczone monetami, których dotyczą.


const NAMES = {
  BTC: ['bitcoin', 'btc'],
  ETH: ['ethereum', 'ether', 'eth'],
  SOL: ['solana', 'sol'],
  HYPE: ['hyperliquid', 'hype'],
  XRP: ['xrp', 'ripple'],
  DOGE: ['dogecoin', 'doge'],
  BNB: ['bnb', 'binance coin'],
  ADA: ['cardano', 'ada'],
  AVAX: ['avalanche', 'avax'],
  LINK: ['chainlink', 'link'],
  SUI: ['sui'],
  GOLD: ['gold'],
  SILVER: ['silver'],
};

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .trim();

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
};

function coinsIn(title, extraTickers) {
  const lower = ` ${title.toLowerCase()} `;
  const found = new Set();
  for (const [coin, words] of Object.entries(NAMES)) {
    for (const w of words) {
      if (new RegExp(`[^a-z0-9]${w}[^a-z0-9]`).test(lower)) found.add(coin);
    }
  }
  for (const t of extraTickers) {
    const bare = t.includes(':') ? t.split(':')[1] : t;
    if (bare.length < 3 || NAMES[bare]) continue;
    // Tickery spoza listy dopasowujemy tylko pisane wielkimi literami, żeby nie łapać zwykłych słów.
    if (new RegExp(`[^A-Za-z0-9]${bare}[^A-Za-z0-9]`).test(` ${title} `)) found.add(bare);
  }
  return [...found];
}

async function fetchFeed(url) {
  // Nagłówek przeglądarki ustawiamy tylko w Node; przeglądarka wysyła własny.
  const headers = typeof process !== 'undefined' && process.versions && process.versions.node ? { 'User-Agent': 'Mozilla/5.0 (rss reader)' } : {};
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const source = new URL(url).hostname.replace(/^www\./, '');
  const items = [];
  for (const block of xml.split(/<item[\s>]/i).slice(1)) {
    const title = tag(block, 'title');
    const link = tag(block, 'link');
    const date = Date.parse(tag(block, 'pubDate'));
    if (!title || !/^https?:\/\//.test(link)) continue;
    items.push({ title, link, ts: Number.isFinite(date) ? date : Date.now(), source });
  }
  return items;
}

async function fetchAll(feeds, extraTickers) {
  const results = await Promise.allSettled(feeds.map(fetchFeed));
  const errors = [];
  let items = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') items = items.concat(r.value);
    else errors.push(`${feeds[i]}: ${r.reason.message || r.reason}`);
  });
  const seen = new Set();
  items = items.filter((it) => (seen.has(it.link) ? false : seen.add(it.link)));
  for (const it of items) it.coins = coinsIn(it.title, extraTickers);
  items.sort((a, b) => b.ts - a.ts);
  return { items: items.slice(0, 120), errors };
}

export { fetchAll };
