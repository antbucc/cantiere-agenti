// Client HTTP verso il server. I codici sono quelli digitati dall'utente e salvati
// nel suo browser (localStorage): non sono mai scritti nel codice del frontend.
// Gli URL sono relativi, così l'app funziona anche sotto un sotto-percorso del reverse proxy.

const K_CORSO = 'cantiere.codice';
const K_DOCENTE = 'cantiere.docente';
export const clientId = Math.random().toString(36).slice(2);

const ls = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* storage non disponibile */ } },
};

export const codes = {
  get corso() { return ls.get(K_CORSO); },
  set corso(v) { ls.set(K_CORSO, v); },
  get docente() { return ls.get(K_DOCENTE); },
  set docente(v) { ls.set(K_DOCENTE, v); },
};

/** Errore HTTP con il messaggio del server. */
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

/** Header di autenticazione, per chi fa fetch in proprio (es. streaming). */
export const authHeaders = () => headers();

function headers(extra = {}) {
  const h = { 'X-Codice-Corso': codes.corso, 'X-Client-Id': clientId, ...extra };
  if (codes.docente) h['X-Codice-Docente'] = codes.docente;
  return h;
}

export async function request(method, url, body, { keepalive = false, raw = false } = {}) {
  const res = await fetch(url, {
    method,
    headers: headers(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    keepalive,
  });
  if (res.status === 401) onUnauthorized();
  if (!res.ok) {
    let msg = `Errore ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* corpo non JSON */ }
    throw new ApiError(res.status, msg);
  }
  if (raw) return res;
  return res.status === 204 ? null : res.json();
}

export const api = {
  login: (codice) => fetch('api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codice }) })
    .then(async (r) => (r.ok ? r.json() : Promise.reject(new ApiError(r.status, (await r.json()).error)))),
  loginDocente: (codice) => request('POST', 'api/login/docente', { codice }),
  config: () => request('GET', 'api/config'),
  groups: () => request('GET', 'api/groups'),
  createGroup: (g) => request('POST', 'api/groups', g),
  patchGroup: (id, patch, opts) => request('PATCH', `api/groups/${encodeURIComponent(id)}`, patch, opts),
  deleteGroup: (id) => request('DELETE', `api/groups/${encodeURIComponent(id)}`),
  board: () => request('GET', 'api/board'),
  setBoard: (id, b) => request('PUT', `api/board/${encodeURIComponent(id)}`, b),
  draft: (body) => request('POST', 'api/ai/draft', body),
  exportText: (path) => request('GET', path, undefined, { raw: true }).then((r) => r.text()),
};

/** Server-Sent Events: EventSource non manda header, quindi il codice va nella query. */
export function connectEvents(handlers) {
  const es = new EventSource(`api/events?codice=${encodeURIComponent(codes.corso)}`);
  for (const [type, fn] of Object.entries(handlers)) {
    if (type === 'open' || type === 'error') es.addEventListener(type, fn);
    else es.addEventListener(type, (e) => fn(JSON.parse(e.data)));
  }
  return es;
}
