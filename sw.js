const CACHE = 'sl-2026-v4';
const CORE_ASSETS = ['/SL_App/', '/SL_App/index.html', '/SL_App/manifest.json', '/SL_App/icons/icon-192.png', '/SL_App/icons/icon-512.png'];

// Sanction lock state — persisted across SW restarts via IDB
let _sanctionLocked = false;

function _readLock() {
  return new Promise(res => {
    try {
      const req = indexedDB.open('sl-sw', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
      req.onsuccess = e => {
        const db = e.target.result;
        const tx = db.transaction('kv', 'readonly');
        const r = tx.objectStore('kv').get('sanctionLocked');
        r.onsuccess = () => res(!!r.result);
        r.onerror = () => res(false);
      };
      req.onerror = () => res(false);
    } catch(e) { res(false); }
  });
}

function _writeLock(val) {
  return new Promise(res => {
    try {
      const req = indexedDB.open('sl-sw', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
      req.onsuccess = e => {
        const db = e.target.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, 'sanctionLocked');
        tx.oncomplete = () => res();
        tx.onerror = () => res();
      };
      req.onerror = () => res();
    } catch(e) { res(); }
  });
}

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE_ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))),
      _readLock().then(v => { _sanctionLocked = v; })
    ]).then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (!e.data) return;

  if (e.data.type === 'SANCTION_LOCK') {
    _sanctionLocked = true;
    _writeLock(true);
    // Reload all clients so they hit the lock immediately
    self.clients.matchAll({ type: 'window' }).then(clients => clients.forEach(c => c.navigate(c.url)));
    return;
  }

  if (e.data.type === 'SANCTION_CLEARED') {
    _sanctionLocked = false;
    _writeLock(false);
    return;
  }

  if (e.data.type === 'SCHEDULE') {
    // notification scheduling (existing logic below)
    _handleSchedule(e.data);
    return;
  }
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.mode === 'navigate') {
    if (_sanctionLocked) {
      // Serve index.html from cache — the app JS will show s-sanction on load
      e.respondWith(caches.match('/SL_App/index.html').then(r => r || fetch(req)));
      return;
    }
    e.respondWith(fetch(req).catch(() => caches.match('/SL_App/index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});

let _timers = [];
function msUntil(h, m) {
  const now = new Date(), t = new Date();
  t.setHours(h, m, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return t - now;
}
function notify(tag, title, body, vibrate) {
  return self.registration.showNotification(title, {
    body, icon: '/SL_App/icons/icon-192.png', tag, renotify: true,
    ...(vibrate ? { vibrate } : {})
  });
}

self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'SCHEDULE') return;
  _timers.forEach(clearTimeout); _timers = [];
  const { nnRemaining = 0, secRemaining = 0, hadFailYesterday = false } = e.data;

  // 9h45 — ouverture imminente
  _timers.push(setTimeout(() =>
    notify('sl-945', 'Solo Leveling', 'La chasse ouvre dans 15 minutes.'),
    msUntil(9, 45)));

  // 13h — aucune quête validée
  _timers.push(setTimeout(() => {
    if (nnRemaining > 0)
      notify('sl-13h', 'Solo Leveling', 'Aucune quête validée. Tu dérives ?', [100, 50, 100]);
  }, msUntil(13, 0)));

  // 17h — si fail hier
  if (hadFailYesterday) {
    _timers.push(setTimeout(() =>
      notify('sl-17h', 'Solo Leveling', 'Tu as déjà chuté hier. Ne recommence pas et finalise ta journée.', [200, 100, 200]),
      msUntil(17, 0)));
  }

  // 21h30 — quêtes obligatoires restantes
  _timers.push(setTimeout(() => {
    if (nnRemaining > 0)
      notify('sl-2130', 'Solo Leveling — Dernière fenêtre', 'Go !', [300, 100, 300, 100, 300]);
  }, msUntil(21, 30)));

  // 15h–16h aléatoire — NN done, secondaires restantes
  if (nnRemaining === 0 && secRemaining > 0) {
    const delay = msUntil(15, 0) + Math.random() * 3600000;
    _timers.push(setTimeout(() =>
      notify('sl-sec', 'Solo Leveling', 'Tu as fini ta journée, mais il y a des quêtes secondaires à effectuer :)'),
      delay));
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/SL_App/'));
});

let _timers = [];
function msUntil(h, m) {
  const now = new Date(), t = new Date();
  t.setHours(h, m, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return t - now;
}
function notify(tag, title, body, vibrate) {
  return self.registration.showNotification(title, {
    body, icon: '/SL_App/icons/icon-192.png', tag, renotify: true,
    ...(vibrate ? { vibrate } : {})
  });
}

function _handleSchedule(data) {
  _timers.forEach(clearTimeout); _timers = [];
  const { nnRemaining = 0, secRemaining = 0, hadFailYesterday = false } = data;

  _timers.push(setTimeout(() =>
    notify('sl-945', 'Solo Leveling', 'La chasse ouvre dans 15 minutes.'),
    msUntil(9, 45)));

  _timers.push(setTimeout(() => {
    if (nnRemaining > 0)
      notify('sl-13h', 'Solo Leveling', 'Aucune quête validée. Tu dérives ?', [100, 50, 100]);
  }, msUntil(13, 0)));

  if (hadFailYesterday) {
    _timers.push(setTimeout(() =>
      notify('sl-17h', 'Solo Leveling', 'Tu as déjà chuté hier. Ne recommence pas et finalise ta journée.', [200, 100, 200]),
      msUntil(17, 0)));
  }

  _timers.push(setTimeout(() => {
    if (nnRemaining > 0)
      notify('sl-2130', 'Solo Leveling — Dernière fenêtre', 'Go !', [300, 100, 300, 100, 300]);
  }, msUntil(21, 30)));

  if (nnRemaining === 0 && secRemaining > 0) {
    const delay = msUntil(15, 0) + Math.random() * 3600000;
    _timers.push(setTimeout(() =>
      notify('sl-sec', 'Solo Leveling', 'Tu as fini ta journée, mais il y a des quêtes secondaires à effectuer :)'),
      delay));
  }
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/SL_App/'));
});
