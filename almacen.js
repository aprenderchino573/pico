// PICO — almacenamiento en el navegador (IndexedDB): estado, historial y canciones.
// Sustituye al servidor local: todo vive en este dispositivo. Copia de seguridad con exportar/importar.

const DB = 'pico', VERSION = 1;
let dbp = null;

function abrir() {
  if (dbp) return dbp;
  dbp = new Promise((ok, ko) => {
    const rq = indexedDB.open(DB, VERSION);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('historial')) db.createObjectStore('historial', { autoIncrement: true });
      if (!db.objectStoreNames.contains('canciones')) db.createObjectStore('canciones', { keyPath: 'nombre' });
    };
    rq.onsuccess = () => ok(rq.result);
    rq.onerror = () => ko(rq.error);
  });
  return dbp;
}
async function tx(store, modo, fn) {
  const db = await abrir();
  return new Promise((ok, ko) => {
    const t = db.transaction(store, modo), s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => ok(r && 'result' in r ? r.result : undefined);
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error);
  });
}

// Pide al navegador que no borre los datos por falta de espacio (en iOS ayuda instalarla como app)
export async function persistir() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}

// ---------- estado ----------
export const leerEstado = async () => (await tx('kv', 'readonly', s => s.get('estado'))) || {};
export const guardarEstado = e => tx('kv', 'readwrite', s => s.put(JSON.parse(JSON.stringify(e)), 'estado'));

// ---------- historial ----------
export const leerHistorial = () => tx('historial', 'readonly', s => s.getAll());
export const anadirEnsayo = t => tx('historial', 'readwrite', s => s.add(t));
async function reemplazarHistorial(filas) {
  await tx('historial', 'readwrite', s => { s.clear(); for (const f of filas) s.add(f); });
}

// ---------- canciones ----------
const EXT = /\.(wav|mp3|flac|m4a|aac|ogg|oga|opus|aif|aiff|caf|webm|mp4)$/i;
export const listarCanciones = async () =>
  (await tx('canciones', 'readonly', s => s.getAllKeys())).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
export async function blobCancion(nombre) {
  const r = await tx('canciones', 'readonly', s => s.get(nombre));
  if (!r) throw new Error('No se encuentra ' + nombre);
  return r.blob;
}
export async function anadirCanciones(files) {
  const nuevas = [];
  for (const f of files) {
    if (!(f.type.startsWith('audio/') || EXT.test(f.name))) continue;
    const nombre = f.name;
    await tx('canciones', 'readwrite', s => s.put({ nombre, blob: f, tam: f.size, t: Date.now() }));
    nuevas.push(nombre);
  }
  return nuevas;
}
export const borrarCancion = nombre => tx('canciones', 'readwrite', s => s.delete(nombre));
export async function espacio() {
  try { const e = await navigator.storage.estimate(); return { usado: e.usage || 0, cuota: e.quota || 0 }; } catch { return null; }
}

// ---------- copia de seguridad ----------
export async function exportar() {
  const datos = { app: 'PICO', version: 1, fecha: new Date().toISOString(), estado: await leerEstado(), historial: await leerHistorial() };
  return new Blob([JSON.stringify(datos)], { type: 'application/json' });
}
// Acepta: una copia de PICO (.json), o los archivos de la versión de escritorio (estado.json, historial.jsonl)
export async function importar(files) {
  let estado = null, historial = null;
  for (const f of files) {
    const txt = await f.text();
    if (/\.jsonl$/i.test(f.name)) {
      historial = txt.split('\n').map(l => l.trim()).filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      continue;
    }
    let j; try { j = JSON.parse(txt); } catch { throw new Error(`${f.name} no es un JSON válido`); }
    if (j.app === 'PICO') { estado = j.estado || {}; historial = j.historial || []; }
    else estado = j;   // estado.json de la versión de escritorio
  }
  if (!estado && !historial) throw new Error('No he encontrado datos de PICO en esos archivos');
  if (estado) await guardarEstado(estado);
  if (historial) await reemplazarHistorial(historial);
  return { estado: !!estado, ensayos: historial ? historial.length : null };
}
