import { PAN_SOURCES, SITE_ORDER, HUB_WORKER_BASE } from '../src/hub.js';

const token = process.env.HUB_SYNC_TOKEN || '';
if (!token) {
  console.log('sync skip: HUB_SYNC_TOKEN not set (hub sync not configured yet)');
  process.exit(0);
}

const panKeySet = new Set(PAN_SOURCES.map((e) => e.key));
const manifest = {
  pan: PAN_SOURCES,
  panOrder: SITE_ORDER.filter((k) => panKeySet.has(k)),
};

const base = String(HUB_WORKER_BASE || '').replace(/\/+$/, '');
if (!base) {
  console.error('sync error: HUB_WORKER_BASE is empty in hub.js');
  process.exit(1);
}

let res;
try {
  res = await fetch(base + '/api/sync/pan', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(manifest),
    signal: AbortSignal.timeout(15000),
  });
} catch (e) {
  console.error('sync error: network/timeout: ' + (e && e.message ? e.message : e));
  process.exit(1);
}

let data = null;
try {
  data = await res.json();
} catch (e) {
  console.error('sync error: bad JSON response, status=' + res.status);
  process.exit(1);
}
if (!res.ok || !data || data.ok !== true) {
  console.error('sync error: status=' + res.status + ' body=' + JSON.stringify(data).slice(0, 500));
  process.exit(1);
}
console.log(
  'sync ok changed=' + data.changed +
  ' panCount=' + data.panCount +
  ' updatedAt=' + (data.updatedAt || '')
);
