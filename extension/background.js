// Proces w tle wtyczki: co 30 sekund sprawdza pozycje obserwowanych traderów i wysyła powiadomienia.
// Tylko odczyt publicznych danych. Wtyczka nie ma dostępu do żadnego portfela i nie składa zleceń.
import { createCore } from './lib/core.js';

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

async function setBadge(n) {
  await chrome.storage.local.set({ unseen: n });
  await chrome.action.setBadgeBackgroundColor({ color: '#3987e5' });
  await chrome.action.setBadgeText({ text: n ? (n > 99 ? '99+' : String(n)) : '' });
}

const platform = {
  mode: 'extension',
  load: async (key) => (await chrome.storage.local.get(key))[key],
  save: (key, value) => chrome.storage.local.set({ [key]: value }),
  notify: async (fresh) => {
    const { unseen = 0 } = await chrome.storage.local.get('unseen');
    await setBadge(unseen + fresh.length);
    const first = fresh[0];
    const one = fresh.length === 1;
    chrome.notifications.create(`ruch-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: one ? `${first.type} ${first.side} ${first.coin}` : `Nowe ruchy obserwowanych: ${fresh.length}`,
      message: one
        ? first.text
        : fresh
            .slice(0, 4)
            .map((e) => `${e.label || short(e.address)}: ${e.type} ${e.side} ${e.coin}`)
            .join('\n'),
      priority: 1,
    });
  },
};

const core = createCore(platform);

function ensureAlarm() {
  chrome.alarms.get('poll', (alarm) => {
    if (!alarm) chrome.alarms.create('poll', { periodInMinutes: 0.5 });
  });
}
chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
ensureAlarm();

// Przeglądarka usypia proces po 30 sekundach bezczynności; dłuższe pobieranie podtrzymujemy lekkim wywołaniem.
async function keepAlive(work) {
  const timer = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  try {
    return await work;
  } finally {
    clearInterval(timer);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'poll') keepAlive(Promise.allSettled([core.tick(), core.maintain()]));
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (msg && msg.type === 'seen') {
    setBadge(0).then(() => sendResponse({ ok: true }));
    return true;
  }
  keepAlive(core.handle(msg)).then(sendResponse, (err) => sendResponse({ error: String(err.message || err) }));
  return true;
});

async function openDashboard() {
  const url = chrome.runtime.getURL('dashboard.html');
  try {
    const open = await chrome.runtime.getContexts({ contextTypes: ['TAB'] });
    const hit = open.find((c) => c.documentUrl && c.documentUrl.startsWith(url));
    if (hit && hit.tabId >= 0) {
      await chrome.tabs.update(hit.tabId, { active: true });
      await chrome.windows.update(hit.windowId, { focused: true });
      return;
    }
  } catch (_) {
    /* starsza przeglądarka: po prostu otwieramy nową kartę */
  }
  await chrome.tabs.create({ url });
}

chrome.action.onClicked.addListener(openDashboard);
chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  openDashboard();
});
