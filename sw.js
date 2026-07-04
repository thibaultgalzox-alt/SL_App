const CACHE = 'metanoia-2026-v2';
const CORE_ASSETS = ['/SL_App/', '/SL_App/index.html', '/SL_App/manifest.json', '/SL_App/icons/icon-192.png', '/SL_App/icons/icon-512.png'];

// >>> À REMPLACER par ta clé VAPID PUBLIQUE (générée à l'étape 1) <<<
const VAPID_PUBLIC = 'BM_-Brbncu8UQ57NoYO3CNz6KSfDEPBnWzIi7OcKzi4Ne4DnBzw4sq-bV6leyhrXyOcOSo44Ibl0cXxw9agQjxE';

// ---- Verrou de sanction (persisté via IDB) ----
let _sanctionLocked = false;
function _readLock() {
  return new Promise(res => {
    try {
      const req = indexedDB.open('metanoia-sw', 1);
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
      const req = indexedDB.open('metanoia-sw', 1);
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
  if (e.data.type === 'SANCTION_LOCK')   { _sanctionLocked = true;  _writeLock(true);  return; }
  if (e.data.type === 'SANCTION_CLEARED'){ _sanctionLocked = false; _writeLock(false); return; }
  if (e.data.type === 'SKIP_WAITING')    { self.skipWaiting(); return; }
  // NB: l'ancien type 'SCHEDULE' (setTimeout) est abandonné : un SW ne survit pas
  //     assez longtemps pour déclencher un rappel différé. Les rappels passent
  //     désormais par le serveur (Web Push), ci-dessous dans l'évènement 'push'.
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.mode === 'navigate') {
    if (_sanctionLocked) {
      e.respondWith(caches.match('/SL_App/index.html').then(r => r || fetch(req)));
      return;
    }
    e.respondWith(fetch(req).catch(() => caches.match('/SL_App/index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});

// ===================== WEB PUSH =====================
// Le serveur envoie une notif ; ce handler l'affiche même app fermée.
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) {
    try { data = { body: e.data.text() }; } catch (__) { data = {}; }
  }
  const title = data.title || 'Metanoia';
  const options = {
    body: data.body || '',
    icon: '/SL_App/icons/icon-192.png',
    badge: '/SL_App/icons/icon-192.png',
    tag: data.tag || 'sl-reminder',
    renotify: true,
    vibrate: data.vibrate || [100, 50, 100],
    data: { url: data.url || '/SL_App/' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// Ré-abonnement automatique si l'abonnement expire/est renouvelé par le navigateur.
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil((async () => {
    try {
      if (!VAPID_PUBLIC || VAPID_PUBLIC.startsWith('REMPLACE')) return;
      await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlB64ToUint8(VAPID_PUBLIC)
      });
      // La nouvelle souscription sera re-synchronisée avec Supabase à la
      // prochaine ouverture de l'app (voir _pushSubscribe côté client).
    } catch (_) {}
  })());
});

function _urlB64ToUint8(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const base = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/SL_App/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if (c.url.includes('/SL_App/') && 'focus' in c) return c.focus(); }
      return clients.openWindow(url);
    })
  );
});
