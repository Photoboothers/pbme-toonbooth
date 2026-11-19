// Every guest is saved on this device first (IndexedDB), then sent, retried and finished in the background.
// If the internet drops, nothing is lost: the queue carries on by itself when the connection is back.
const DB = 'tb-booth', STORE = 'jobs';
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return dbp;
}
async function tx(mode, fn) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(STORE, mode), s = t.objectStore(STORE); const out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); }
export const saveJob = (j) => tx('readwrite', (s) => s.put(j)).catch(() => {});
export const delJob = (id) => tx('readwrite', (s) => s.delete(id)).catch(() => {});
export async function allJobs() { try { const d = await db(); return await new Promise((res) => { const r = d.transaction(STORE).objectStore(STORE).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }); } catch { return []; } }

// same alphabet as the server's ids, so the guest's QR code works before the server has even seen the photo
export function newId(n = 10) { const a = 'abcdefghijkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(n)); let s = ''; for (let i = 0; i < n; i++) s += a[b[i] % a.length]; return s; }

// fetch that gives up after a few seconds instead of hanging on a weak connection
export async function tfetch(url, opts = {}, ms = 15000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { credentials: 'same-origin', ...opts, signal: c.signal }); } finally { clearTimeout(t); }
}

// ---------- connection check (for the status dot and instant mode) ----------
export const net = { online: navigator.onLine, checked: 0 };
export async function checkNet() {
  try { const r = await tfetch('/api/me', { cache: 'no-store' }, 5000); net.online = r.status === 200 || r.status === 401; }
  catch { net.online = false; }
  net.checked = Date.now(); return net.online;
}
