// PICO — interfaz y flujo de juego
import * as C from './contenido.js';
import { Motor, bandaDe, magH } from './audio.js';
import * as ST from './stats.js';
import { icono, iconoComodin, ZONA_ICONO, ZONA_COLOR, TIPO_COLOR, NOMBRE_TIPO } from './iconos.js';
import * as A from './almacen.js';

const motor = new Motor();
const app = document.getElementById('app');
const S = {
  meta: null, canciones: [], historial: [],
  pantalla: 'menu', run: null,
  sel: null, marcadas: new Set(), iv: null, res: null,
  drag: null, hover: null, geo: { L: 0, R: 1 },
  cargando: false, aviso: null,
  med: { config: { rango: 'completo', fuente: 'ruido', n: 20, pres: 'ab' }, activo: false, fin: false },
  filtro: 'todas',
};
const segs = new Map();       // pista.id -> AudioBuffer del fragmento
const espectros = new Map();  // pista.id -> potencia por bandas
const buffers = new Map();    // archivo -> AudioBuffer completo (1 en memoria en móvil, 2 en escritorio)
const TACTIL = matchMedia('(pointer: coarse)').matches;
const MAX_BUFFERS = TACTIL ? 1 : 2;
const UNOS = new Float64Array(31).fill(1);

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const n0 = x => (x % 1 ? C.num(x, 1) : String(x));
const pct = x => Math.round(x * 100) + ' %';

// ---------- Persistencia ----------
// Todo se guarda en este dispositivo (IndexedDB). Copia de seguridad: Datos → Exportar / Importar.
let tGuardar = null;
function guardar() {
  S.meta.partida = S.run && !['victoria', 'derrota'].includes(S.run.fase) ? S.run : null;
  clearTimeout(tGuardar);
  tGuardar = setTimeout(() => A.guardarEstado(S.meta).catch(() => avisar('No se pudo guardar el estado.')), 300);
}
function registrar(t) { S.historial.push(t); A.anadirEnsayo(t).catch(() => avisar('No se pudo guardar la prueba en el historial.')); }
function avisar(txt) { S.aviso = txt; render(); setTimeout(() => { if (S.aviso === txt) { S.aviso = null; render(); } }, 5000); }

// ---------- Canciones ----------
const nombreCancion = f => f.split('/').pop().replace(/\.[^.]+$/, '');
function desbloqueadas() { const set = new Set(S.canciones); return S.meta.desbloqueadas.filter(f => set.has(f)); }
function desbloquearLista(files) {
  const nuevas = files.filter(f => !S.meta.desbloqueadas.includes(f));
  S.meta.desbloqueadas.push(...nuevas);
  return nuevas;
}
function desbloquear(n) {
  const ya = new Set(S.meta.desbloqueadas), libres = S.canciones.filter(f => !ya.has(f)), nuevas = [];
  for (let i = 0; i < n && libres.length; i++) {
    const f = libres.splice(Math.floor(Math.random() * libres.length), 1)[0];
    S.meta.desbloqueadas.push(f); nuevas.push(f);
  }
  return nuevas;
}
async function bufferCancion(file) {
  if (buffers.has(file)) return buffers.get(file);
  if (TACTIL) buffers.clear();   // en móvil, libera la anterior antes de decodificar (una canción decodificada ocupa decenas de MB)
  const datos = await (await A.blobCancion(file)).arrayBuffer();
  const buf = await new Promise((ok, ko) => motor.ctx.decodeAudioData(datos, ok, ko));
  buffers.set(file, buf);
  while (buffers.size > MAX_BUFFERS) buffers.delete(buffers.keys().next().value);
  if (!S.meta.canciones[file]) {
    S.meta.canciones[file] = { planitud: motor.planitud(motor.espectro(buf, 40)), dur: buf.duration };
    guardar();
  }
  return buf;
}
function rareza(file) {
  const info = S.meta.canciones[file];
  if (!info) return null;
  const todas = S.canciones.map(f => S.meta.canciones[f]?.planitud).filter(x => x !== undefined);
  if (todas.length < 3) return 'común';
  const rank = todas.filter(x => x <= info.planitud).length / todas.length;
  return rank > 0.85 ? 'épica' : rank > 0.55 ? 'rara' : 'común';
}

// ---------- Pistas ----------
function elegirF(P, lo, hi) {
  const a = Math.log2(lo), b = Math.log2(hi), r = () => 2 ** (a + Math.random() * (b - a));
  if (!P) return r();
  const dB = Array.from(P, x => 10 * Math.log10(x + 1e-20)), max = Math.max(...dB);
  for (let i = 0; i < 400; i++) { const f = r(); if (dB[bandaDe(f)] >= max - 25) return f; } // solo donde la canción tiene energía
  return r();
}
function rangoPista(params) {
  let [lo, hi] = params.rango || [C.GEN_MIN, C.GEN_MAX];
  if (params.debil && Math.random() < 0.5) {
    const z = C.ZONA[ST.zonaMasDebil(S.historial)];
    lo = Math.max(z.lo, C.GEN_MIN); hi = Math.min(z.hi, C.GEN_MAX);
  }
  return [lo, hi];
}
async function nuevaPista(params) {
  const id = uid(), [lo, hi] = rangoPista(params);
  const base = { id, bypassUsado: false, zonaRevelada: false };
  if (params.fuente === 'cancion') {
    const lista = params.soloDesbloqueadas ? desbloqueadas() : [...S.canciones];   // en partida, todo el banco: las no descubiertas se ven como «???»
    for (let intento = 0; intento < 3 && lista.length; intento++) {
      const file = C.pick(lista);
      try {
        const buf = await bufferCancion(file);
        const dur = Math.min(8, Math.max(1, buf.duration - 0.5));
        const start = Math.max(0, buf.duration * 0.1 + Math.random() * Math.max(0, buf.duration * 0.8 - dur));
        const seg = motor.segmento(buf, start, dur), P = motor.espectro(seg, 30);
        segs.set(id, seg); espectros.set(id, P);
        return { ...base, f: elegirF(P, lo, hi), src: { tipo: 'cancion', file, start, dur } };
      } catch (e) { console.warn(e); }
    }
  }
  return { ...base, f: elegirF(null, lo, hi), src: { tipo: 'ruido' } };
}
async function asegurarSeg(p) {
  if (p.src.tipo !== 'cancion') return motor.rosa;
  if (!segs.has(p.id)) {
    try {
      const buf = await bufferCancion(p.src.file), seg = motor.segmento(buf, p.src.start, p.src.dur);
      segs.set(p.id, seg); espectros.set(p.id, motor.espectro(seg, 30));
    } catch { p.src = { tipo: 'ruido' }; return motor.rosa; }
  }
  return segs.get(p.id);
}
function pistaPorId(id) {
  if (S.res?.pista?.id === id) return S.res.pista;
  if (S.pantalla === 'medicion') return S.med.pista?.id === id ? S.med.pista : null;
  return S.run?.pistas.find(p => p.id === id) || null;
}
const params = () => (S.pantalla === 'medicion' ? S.med.params : S.run.params);

// ---------- Escucha ----------
async function seleccionar(id) {
  await motor.init();
  const p = pistaPorId(id); if (!p) return;
  const silencio = motor.sonando && S.sel !== id ? 1 : 0;   // al pasar de una pista a otra, 1 s de silencio
  S.sel = id; S.comparando = false;
  if (!S.res) p.t0 ??= Date.now() + silencio * 1000;
  const buf = await asegurarSeg(p);
  const prm = params(), P = p.src.tipo === 'cancion' ? espectros.get(p.id) : UNOS;
  motor.reproducir(buf, { f: p.f, q: prm.q, gain: prm.gain, comp: motor.compensacion(P, p.f, prm.q, prm.gain) },
                   { ab: !prm.continuo, silencio });
  render();
}
function alternar() {
  if (motor.sonando) { motor.parar(); render(); }
  else if (S.comparando) comparar(true);
  else if (S.sel) seleccionar(S.sel);
}
// Comparador: tras revelar, alterna un pico idéntico en el centro de tu respuesta y el pico real.
async function comparar(forzar = false) {
  if (!S.res) return;
  if (S.comparando && !forzar) { S.comparando = false; return seleccionar(S.res.pista.id); }
  await motor.init();
  const p = S.res.pista, prm = params(), buf = await asegurarSeg(p);
  const P = p.src.tipo === 'cancion' ? espectros.get(p.id) : UNOS;
  const tu = 2 ** ((S.res.a + S.res.b) / 2);
  const fase = (f, etq) => ({ f, gain: prm.gain, comp: motor.compensacion(P, f, prm.q, prm.gain), etq });
  S.comparando = true;
  motor.reproducir(buf, { f: p.f, q: prm.q, gain: prm.gain, comp: 1 }, { fases: [fase(tu, 'TÚ'), fase(p.f, 'REAL')] });
  render();
}
function bypass(on) {
  if (on === motor.bypassOn) return;            // los pointerup sueltos no deben tocar el A/B
  if (on && (!motor.sonando || params().noBypass)) return;
  motor.setBypass(on);
  const p = pistaPorId(S.sel);
  if (on && p && !S.res) p.bypassUsado = true;
  document.getElementById('btn-bypass')?.classList.toggle('activo', on);
}

// ---------- Partida ----------
function progreso(baraja) {
  S.meta.progreso ||= {};
  return (S.meta.progreso[baraja] ||= { abierto: 1, superados: [] });
}
const rejilla = () => (S.pantalla === 'juego' && S.run ? C.nivelInfo(S.run.nivel || 4).rejilla : 'libre');
function nuevaPartida(baraja, nivel = 1) {
  S.run = {
    baraja, nivel, ante: 1, ciega: 0, dinero: C.DINERO_INICIAL,
    comodines: [], consumibles: [], niveles: C.nivelesIniciales(),
    jefesVencidos: 0, jefesUsados: [], jefe: null, fase: 'previa',
    puntos: 0, manos: 0, descartes: 0, pistas: [], ultimaZona: null, tienda: null,
    stats: { manos: 0, aciertos: 0, mejor: 0 },
  };
  prepararAnte();
  S.pantalla = 'juego';
  guardar(); render();
}
function prepararAnte() {
  const r = S.run;
  const pos = C.JEFES.filter(j => (j.minAnte || 1) <= r.ante && !r.jefesUsados.includes(j.id));
  const j = C.pick(pos.length ? pos : C.JEFES);
  r.jefe = j.id; r.jefesUsados.push(j.id); r.fase = 'previa';
}
async function empezarCiega() {
  const r = S.run, b = C.BARAJAS[r.baraja];
  r.params = C.paramsCiega(r, S.canciones.length > 0);
  r.objetivo = C.objetivo(r.nivel, r.ante, r.ciega);
  Object.assign(r, { puntos: 0, manos: b.manos + (r.ante === 1 ? C.MANO_EXTRA_ANTE1 : 0), descartes: b.descartes, pistas: [], fase: 'ciega',
    jugadasRonda: [], zonasRonda: [], aciertosRonda: 0, ultimoFallo: false, zonaDebil: ST.zonaMasDebil(S.historial) });
  C.alEmpezarRonda(r);
  limpiarMesa();
  await motor.init();
  await rellenar();
}
function limpiarMesa() { motor.parar(); S.comparando = false; S.sel = null; S.iv = null; S.res = null; S.marcadas.clear(); segs.clear(); espectros.clear(); }
async function rellenar() {
  const r = S.run;
  S.cargando = true; render();
  try { while (r.pistas.length < r.params.handSize) r.pistas.push(await nuevaPista(r.params)); }
  finally { S.cargando = false; }
  guardar(); render();
}
function jugar() {
  const r = S.run;
  if (S.res || !S.sel || !S.iv || r.manos <= 0 || S.cargando) return;
  const p = r.pistas.find(x => x.id === S.sel); if (!p) return;
  const res = C.puntuar(r, p, S.iv.a, S.iv.b, p.t0 ? (Date.now() - p.t0) / 1000 : null);
  r.ultimoFallo = !res.hit;
  if (p.src.tipo === 'cancion') r.jugadasRonda = [...new Set([...(r.jugadasRonda || []), p.src.file])];
  if (res.hit) { r.aciertosRonda = (r.aciertosRonda || 0) + 1; r.zonasRonda = [...new Set([...(r.zonasRonda || []), res.zona])]; }
  S.anim = { desde: r.puntos, retardo: 260 * (res.log.length + 1) };
  r.puntos += res.total; r.dinero += res.dinero; r.manos--; r.ultimaZona = res.zona;
  r.stats.manos++; if (res.real) r.stats.aciertos++; r.stats.mejor = Math.max(r.stats.mejor, res.total);
  r.pistas = r.pistas.filter(x => x !== p);
  S.marcadas.delete(p.id);
  registrar(ensayo(p, res, { modo: 'partida', baraja: r.baraja, nivel: r.nivel, rejilla: C.nivelInfo(r.nivel).rejilla, ante: r.ante, ciega: r.ciega, jefe: r.ciega === 2 ? r.jefe : null, rango: 'completo', puntos: res.total }, r.params));
  S.res = { ...res, pista: p, a: S.iv.a, b: S.iv.b, nuevo: true };
  guardar(); render();
}
function ensayo(p, ev, extra, prm) {
  return {
    t: new Date().toISOString(), fuente: p.src.tipo, cancion: p.src.file || null,
    gain: prm.gain, q: prm.q, f: p.f, lo: 2 ** ev.mid / 2 ** (ev.w / 2), hi: 2 ** ev.mid * 2 ** (ev.w / 2),
    centro: ev.centro, err: ev.err, w: ev.w, acierto: ev.real, bypass: p.bypassUsado,
    presentacion: prm.continuo ? 'continua' : 'ab', ...extra,
  };
}
async function continuar() {
  const r = S.run, p = S.res.pista;
  segs.delete(p.id); espectros.delete(p.id);
  motor.parar(); S.comparando = false; S.res = null; S.iv = null; S.sel = null;
  if (r.puntos >= r.objetivo) return ganarCiega();
  if (r.manos <= 0) { r.fase = 'derrota'; guardar(); return render(); }
  await rellenar();
}
async function descartar() {
  const r = S.run;
  if (S.res || r.descartes <= 0 || !S.marcadas.size || S.cargando) return;
  const ids = [...S.marcadas];
  r.pistas = r.pistas.filter(p => !S.marcadas.has(p.id));
  ids.forEach(id => { segs.delete(id); espectros.delete(id); });
  if (ids.includes(S.sel)) { motor.parar(); S.sel = null; }
  S.marcadas.clear(); r.descartes--;
  C.alDescartar(r, ids.length);
  await rellenar();
}
function marcar(id) {
  if (!id || S.res) return;
  S.marcadas.has(id) ? S.marcadas.delete(id) : S.marcadas.add(id);
  render();
}
function ganarCiega() {
  const r = S.run, base = C.RECOMPENSA[r.ciega], manos = r.manos, interes = Math.min(5, Math.floor(r.dinero / 5));
  const extra = C.dineroFinRonda(r);
  r.dinero += base + manos + interes + extra;
  r.premio = { base, manos, interes, extra, nuevas: [] };
  if (r.ciega === 2) r.jefesVencidos++;
  r.premio.nuevas = desbloquearLista(r.jugadasRonda || []);
  if (r.ciega === 2 && r.ante === C.N_ANTES) {
    r.fase = 'victoria'; S.meta.victorias = (S.meta.victorias || 0) + 1;
    const pr = progreso(r.baraja);
    pr.superados = [...new Set([...pr.superados, r.nivel])];
    pr.abierto = Math.min(C.N_NIVELES, Math.max(pr.abierto, r.nivel + 1));
  } else r.fase = 'premio';
  guardar(); render();
}
function irTienda() { const r = S.run; r.tienda = C.generarTienda(r); r.reroll = 5; r.fase = 'tienda'; guardar(); render(); }
function siguiente() {
  const r = S.run;
  r.ciega++; r.tienda = null;
  if (r.ciega > 2) { r.ante++; r.ciega = 0; prepararAnte(); } else r.fase = 'previa';
  guardar(); render();
}
function comprarComodin(i) {
  const r = S.run, o = r.tienda.comodines[i];
  if (!o || r.dinero < o.precio || r.comodines.length >= C.SLOTS_COMODIN) return;
  r.dinero -= o.precio; r.comodines.push({ id: o.id, precio: o.precio, st: {} }); r.tienda.comodines.splice(i, 1);
  guardar(); render();
}
function comprarItem(i) {
  const r = S.run, o = r.tienda.items[i];
  if (!o || r.dinero < o.precio) return;
  if (o.tipo === 'planeta') C.subirNivel(r, o.zona);
  else { if (r.consumibles.length >= C.SLOTS_CONSUMIBLE) return; r.consumibles.push(o.tipo); }
  r.dinero -= o.precio; r.tienda.items.splice(i, 1);
  guardar(); render();
}
// El orden importa: los efectos se aplican de izquierda a derecha, y Sidechain copia al de su derecha.
function moverComodin(de, a) {
  const l = S.run?.comodines; if (!l || de === a || a < 0 || a >= l.length || de < 0 || de >= l.length) return;
  l.splice(a, 0, l.splice(de, 1)[0]);
  guardar(); render();
}
let arrastre = null;
app.addEventListener('dragstart', e => {
  const u = e.target.closest?.('.unidad[draggable]'); if (!u) return;
  arrastre = +u.dataset.i; u.classList.add('arrastrando');
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', u.dataset.i);
});
app.addEventListener('dragover', e => {
  const u = e.target.closest?.('.unidad'); if (arrastre === null || !u) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.unidad.destino').forEach(x => x !== u && x.classList.remove('destino'));
  u.classList.add('destino');
});
app.addEventListener('drop', e => {
  const u = e.target.closest?.('.unidad'); if (arrastre === null || !u) return;
  e.preventDefault();
  const n = S.run.comodines.length, a = u.dataset.i !== undefined ? +u.dataset.i : n - 1;
  const de = arrastre; arrastre = null;
  moverComodin(de, Math.min(a, n - 1));
});
app.addEventListener('dragend', () => { arrastre = null; document.querySelectorAll('.arrastrando, .destino').forEach(x => x.classList.remove('arrastrando', 'destino')); });
function vDetalle() {
  const r = S.run, i = S.detalle, j = r?.comodines[i];
  if (!j) { S.detalle = null; return ''; }
  const n = r.comodines.length;
  return `<div class="modal" data-acc="cerrarDetalle"><div class="modal-caja" data-acc="nada">
    ${cartaComodin(j.id, { st: j.st })}
    <div class="modal-botones">
      <button class="btn" data-acc="moverDet" data-arg="-1" ${i === 0 ? 'disabled' : ''}>‹ mover</button>
      <button class="btn" data-acc="moverDet" data-arg="1" ${i === n - 1 ? 'disabled' : ''}>mover ›</button>
      <button class="btn rojo" data-acc="venderDet">Vender $${Math.floor(j.precio / 2)}</button>
      <button class="btn ambar" data-acc="cerrarDetalle">Cerrar</button>
    </div>
  </div></div>`;
}
function vender(i) {
  const r = S.run, j = r.comodines[i]; if (!j) return;
  r.dinero += Math.floor(j.precio / 2); r.comodines.splice(i, 1);
  guardar(); render();
}
function rerollTienda() {
  const r = S.run; if (r.dinero < r.reroll) return;
  r.dinero -= r.reroll; r.reroll++; r.tienda = C.generarTienda(r);
  guardar(); render();
}
function usarConsumible(i) {
  const r = S.run, tipo = r.consumibles[i];
  if (!tipo || r.fase !== 'ciega' || S.res) return;
  if (tipo === 'diapason') {
    if (!S.iv || !motor.ctx) return avisar('El diapasón necesita un intervalo marcado.');
    motor.tono(2 ** ((S.iv.a + S.iv.b) / 2));
  } else if (tipo === 'brujula') {
    const p = pistaPorId(S.sel); if (!p) return avisar('Selecciona primero una pista.');
    p.zonaRevelada = true;
  }
  r.consumibles.splice(i, 1); guardar(); render();
}

// ---------- Medición ----------
function empezarMedicion() {
  const c = S.med.config;
  S.med = { config: c, activo: true, fin: false, i: 0, hechos: [], pista: null,
    params: { gain: 12, q: 2, handSize: 1, soloDesbloqueadas: true, continuo: c.pres === 'continua', fuente: c.fuente === 'cancion' && desbloqueadas().length ? 'cancion' : 'ruido', rango: c.rango === 'medios' ? [250, 1000] : null } };
  siguienteMed();
}
async function siguienteMed() {
  limpiarMesa();
  await motor.init();
  S.cargando = true; render();
  try { S.med.pista = await nuevaPista(S.med.params); } finally { S.cargando = false; }
  await seleccionar(S.med.pista.id);
}
function responderMed() {
  if (S.res || !S.iv || !S.med.pista) return;
  const p = S.med.pista, ev = C.evaluar(p, S.iv.a, S.iv.b);
  const t = ensayo(p, ev, { modo: 'medicion', rango: S.med.config.rango === 'medios' ? '250-1000' : 'completo', puntos: null }, S.med.params);
  registrar(t); S.med.hechos.push(t);
  S.res = { ...ev, hit: ev.real, pista: p, a: S.iv.a, b: S.iv.b, log: [] };
  render();
}
function continuarMed() {
  S.med.i++;
  if (S.med.i >= S.med.config.n) { limpiarMesa(); S.med.activo = false; S.med.fin = true; return render(); }
  siguienteMed();
}

// ---------- Acciones (delegación de clics) ----------
const ACC = {
  pantalla: a => { limpiarMesa(); S.pantalla = a; if (a === 'medicion') { S.med.activo = false; S.med.fin = false; } render(); },
  menu: () => { limpiarMesa(); if (S.run && ['victoria', 'derrota'].includes(S.run.fase)) S.run = null; S.pantalla = 'menu'; render(); },
  continuarPartida: async () => {
    S.run = S.meta.partida; S.pantalla = 'juego'; limpiarMesa(); await motor.init();
    const r = S.run;
    if (r.baraja === 'saturno') r.baraja = 'barro';
    r.nivel ||= 4;   // partidas de versiones anteriores: intervalo libre
    if (r.fase === 'ciega') {  // si se cerró con un resultado en pantalla, cerrar la ciega correctamente
      if (r.puntos >= r.objetivo) return ganarCiega();
      if (r.manos <= 0) { r.fase = 'derrota'; guardar(); return render(); }
      if (r.pistas.length < r.params.handSize) return rellenar();
    }
    render();
  },
  nueva: () => abrirNueva(),
  elegirBaraja: id => abrirNueva(id, S.run?.baraja === id
    ? Math.min(progreso(id).abierto, S.run.nivel + (S.run.fase === 'victoria' ? 1 : 0)) : undefined),
  barajaMov: d => moverBaraja(+d),
  nivelSel: n => { S.nivelSel = +n; render(); },
  jugarNueva: () => jugarNueva(),
  reintentar, siguienteNivel,
  empezarCiega: () => empezarCiega(),
  sel: id => { if (!S.res) seleccionar(id); },
  marcar: id => marcar(id),
  alternar, jugar, continuar, descartar, comparar: () => comparar(),
  irTienda, siguiente,
  comprarComodin: i => comprarComodin(+i), comprarItem: i => comprarItem(+i), vender: i => vender(+i),
  reroll: rerollTienda, usar: i => usarConsumible(+i),
  nada: () => {},
  detalle: i => { if (!compacto()) return; S.detalle = +i; render(); },
  cerrarDetalle: () => { S.detalle = null; render(); },
  moverDet: d => { const i = S.detalle, a = i + +d; if (a < 0 || a >= S.run.comodines.length) return; S.detalle = a; moverComodin(i, a); },
  venderDet: () => { const i = S.detalle; S.detalle = null; vender(i); },
  ivAncho: d => ajustarIv('ancho', +d),
  ivMover: d => ajustarIv('mover', +d),
  moverComodin: a => { const [i, d] = a.split(':').map(Number); moverComodin(i, i + d); },
  medCfg: (v, el) => { const [k, val] = v.split(':'); S.med.config[k] = k === 'n' ? +val : val; render(); },
  medEmpezar: empezarMedicion, medResponder: responderMed, medContinuar: continuarMed,
  filtro: f => { S.filtro = f; render(); },
  descansoOk: () => { S.descanso = false; S.tMesa = 0; render(); },
  exportarCopia: async () => {
    const blob = await A.exportar();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `pico-copia-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  },
  quitarCancion: async f => {
    if (!confirm(`¿Quitar «${nombreCancion(f)}» del banco de este dispositivo?`)) return;
    await A.borrarCancion(f); S.canciones = await A.listarCanciones(); buffers.delete(f); render();
  },
  exportar: () => {
    const blob = new Blob([ST.csv(filtrar(S.historial))], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pico-historial-${S.filtro}.csv`; a.click();
  },
};
app.addEventListener('click', e => {
  const b = e.target.closest('[data-acc]');
  if (!b || b.disabled) return;
  e.stopPropagation();
  ACC[b.dataset.acc]?.(b.dataset.arg, b);
});
app.addEventListener('pointerdown', e => { if (e.target.closest('#btn-bypass')) { e.preventDefault(); bypass(true); } });
app.addEventListener('pointerup', () => bypass(false));
app.addEventListener('pointercancel', () => bypass(false));
app.addEventListener('contextmenu', e => { if (e.target.closest('#btn-bypass, #eq, .canal')) e.preventDefault(); });
app.addEventListener('pointerleave', () => bypass(false));

// ---------- Teclado ----------
let reintentando = false;
async function reintentar() {
  if (reintentando) return;
  reintentando = true;
  try { await reintentarYa(); } finally { reintentando = false; }
}
async function reintentarYa(nivel) {
  const baraja = S.run?.baraja || 'estudio';
  nivel ??= S.run?.nivel || 1;
  limpiarMesa();
  nuevaPartida(baraja, nivel);
  await empezarCiega();   // directo a la primera ciega, sin pasar por la pantalla previa
}
async function jugarNueva() {
  if (reintentando) return;
  reintentando = true;
  try { limpiarMesa(); nuevaPartida(S.barajaSel, S.nivelSel); await empezarCiega(); } finally { reintentando = false; }
}
document.addEventListener('keydown', e => {
  if (S.pantalla !== 'nueva' || e.metaKey || e.ctrlKey) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); moverBaraja(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); moverBaraja(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moverNivel(1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); moverNivel(-1); }
  else if (/^[1-8]$/.test(e.key) && +e.key <= progreso(S.barajaSel).abierto) { S.nivelSel = +e.key; render(); }
  else if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); jugarNueva(); }
});
async function siguienteNivel() {
  if (reintentando) return;
  reintentando = true;
  try { await reintentarYa(Math.min(C.N_NIVELES, (S.run?.nivel || 1) + 1)); } finally { reintentando = false; }
}
const haySiguiente = r => r.fase === 'victoria' && r.nivel < C.N_NIVELES;
document.addEventListener('keydown', e => {
  if (S.pantalla !== 'juego' || !['victoria', 'derrota'].includes(S.run?.fase) || e.repeat) return;
  const k = e.key.toLowerCase();
  if (e.key === 'Enter') { e.preventDefault(); haySiguiente(S.run) ? siguienteNivel() : reintentar(); }
  else if (k === 'r') { e.preventDefault(); reintentar(); }
});
const enMesa = () => (S.pantalla === 'juego' && S.run?.fase === 'ciega') || (S.pantalla === 'medicion' && S.med.activo);
document.addEventListener('keydown', e => {
  if (!enMesa() || e.metaKey || e.ctrlKey) return;
  const med = S.pantalla === 'medicion', k = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); alternar(); }
  else if (k === 'b') { if (!e.repeat) bypass(true); }
  else if (e.key === 'Enter') { e.preventDefault(); if (S.res) (med ? continuarMed() : continuar()); else (med ? responderMed() : jugar()); }
  else if (!med && /^[1-5]$/.test(e.key)) { const p = S.run.pistas[+e.key - 1]; if (p && !S.res) seleccionar(p.id); }
  else if (k === 'c' && S.res) comparar();
  else if (!med && k === 'd') descartar();
  else if (!med && k === 'm') marcar(S.sel);
  else if (e.key.startsWith('Arrow') && !S.res && rejilla() !== 'libre') {
    e.preventDefault();
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const l = C.BANDAS_REJILLA[rejilla()];
    let i = S.iv ? l.findIndex(x => Math.abs(x.a - S.iv.a) < 1e-9) : Math.floor(l.length / 2) - (e.key === 'ArrowRight' ? 1 : 0);
    i = Math.max(0, Math.min(l.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
    S.iv = { a: l[i].a, b: l[i].b }; actualizarInfo();
  }
  else if (e.key.startsWith('Arrow') && S.iv && !S.res) {
    e.preventDefault();
    const paso = e.shiftKey ? 1 / 3 : 1 / 12;
    let { a, b } = S.iv;
    if (e.key === 'ArrowLeft') { a -= paso; b -= paso; }
    if (e.key === 'ArrowRight') { a += paso; b += paso; }
    if (e.key === 'ArrowUp') { a -= paso / 2; b += paso / 2; }
    if (e.key === 'ArrowDown' && b - a - paso >= C.W_MIN) { a += paso / 2; b -= paso / 2; }
    fijarIv(a, b); actualizarInfo();
  }
});
document.addEventListener('keyup', e => { if (e.key.toLowerCase() === 'b') bypass(false); });

const compacto = () => matchMedia('(max-height: 520px)').matches;
// Ajustes del intervalo con botones (táctil) — misma lógica que las flechas del teclado
function ajustarIv(tipo, d) {
  if (S.res) return;
  if (rejilla() !== 'libre') {
    const l = C.BANDAS_REJILLA[rejilla()];
    let i = S.iv ? l.findIndex(x => Math.abs(x.a - S.iv.a) < 1e-9) : Math.floor(l.length / 2) - (d > 0 ? 1 : 0);
    i = Math.max(0, Math.min(l.length - 1, i + (tipo === 'mover' ? d : 0)));
    S.iv = { a: l[i].a, b: l[i].b }; return render();
  }
  if (!S.iv) { const c = Math.log2(1000); S.iv = { a: c - 1 / 6, b: c + 1 / 6 }; }
  let { a, b } = S.iv; const paso = 1 / 6;
  if (tipo === 'mover') { a += d * paso; b += d * paso; }
  else if (d > 0 || b - a - paso >= C.W_MIN) { a -= d * paso / 2; b += d * paso / 2; }
  fijarIv(a, b); actualizarInfo(); render();
}
function fijarIv(a, b) {
  const w = Math.min(C.R_OCT, Math.max(C.W_MIN, b - a));
  let m = (a + b) / 2;
  m = Math.min(C.LF_MAX - w / 2, Math.max(C.LF_MIN + w / 2, m));
  S.iv = { a: m - w / 2, b: m + w / 2 };
}

// ---------- Vistas ----------
function render() {
  const v = { menu: vMenu, nueva: vNueva, datos: vDatos, juego: vJuego, medicion: vMedicion, stats: vStats, coleccion: vColeccion }[S.pantalla];
  app.innerHTML = v() + (S.detalle != null && S.pantalla === 'juego' ? vDetalle() : '') + (S.aviso ? `<div class="toast">${esc(S.aviso)}</div>` : '');
  S.anim = null;
  montarCanvas();
  mostrarEspacio();
  animar();
}

function vMenu() {
  const p = S.meta.partida;
  return `<div class="pantalla menu">
    <div class="logo"><div class="logo-q">PICO</div><div class="logo-pico"></div><div class="logo-sub">roguelite de identificación de frecuencias</div></div>
    <div class="menu-botones">
      ${p ? `<button class="btn grande ambar" data-acc="continuarPartida">Continuar partida · Ante ${p.ante}</button>` : ''}
      <button class="btn grande" data-acc="nueva">Nueva partida</button>
      <button class="btn grande" data-acc="pantalla" data-arg="medicion">Modo medición</button>
      <button class="btn grande" data-acc="pantalla" data-arg="stats">Estadísticas</button>
      <button class="btn grande" data-acc="pantalla" data-arg="coleccion">Colección · ${desbloqueadas().length}/${S.canciones.length}</button>
      <button class="btn grande" data-acc="pantalla" data-arg="datos">Copia de seguridad</button>
    </div>
    <p class="pie">${S.historial.length} pruebas registradas · ${S.meta.victorias || 0} partidas ganadas · Do4 = 261,6 Hz</p>
    ${!S.canciones.length ? '<p class="nota-aviso">Aún no hay canciones: añádelas en <b>Colección</b>. Mientras, los niveles de canciones usan ruido rosa.</p>' : ''}
  </div>`;
}

// ---------- Cartas ----------
const estrellas = n => `<span class="estrellas">${'◆'.repeat(n)}${'◇'.repeat(4 - n)}</span>`;
function cartaComodin(id, { st = {}, pie = '', clase = '' } = {}) {
  const d = C.COMODINES[id], color = d.familia ? ZONA_COLOR[d.zona] : TIPO_COLOR[d.tipo];
  return `<div class="carta-c rz-${d.rareza} ${clase}" style="--arte:${color}" data-comodin="${esc(d.nombre)}">
    <div class="cc-arte">${iconoComodin(id, d)}${d.familia ? estrellas(d.nivelFam) : ''}<span class="cc-tipo">${NOMBRE_TIPO[d.tipo]}</span></div>
    <div class="cc-nombre">${esc(d.nombre)}</div>
    <div class="cc-desc">${esc(C.descComodin({ id, st }))}</div>
    <div class="cc-rz">${d.rareza}</div>
    ${pie}
  </div>`;
}
function cartaSimple({ ico, color, nombre, desc, etiqueta = '', pie = '', clase = '', estilo = '' }) {
  return `<div class="carta-c ${clase}" style="--arte:${color};${estilo}">
    <div class="cc-arte">${icono(ico)}${etiqueta ? `<span class="cc-tipo">${etiqueta}</span>` : ''}</div>
    <div class="cc-nombre">${nombre}</div>
    <div class="cc-desc">${desc}</div>
    ${pie}
  </div>`;
}

// ---------- Nueva partida: baraja + nivel en una pantalla ----------
const BARAJA_IDS = Object.keys(C.BARAJAS);
const BARAJA_ICO = { estudio: 'b_estudio', barro: 'b_barro' };
function abrirNueva(baraja, nivel) {
  S.barajaSel = baraja || S.barajaSel || 'estudio';
  S.nivelSel = nivel || progreso(S.barajaSel).abierto;
  limpiarMesa(); S.pantalla = 'nueva'; render();
}
function moverBaraja(d) {
  const i = (BARAJA_IDS.indexOf(S.barajaSel) + d + BARAJA_IDS.length) % BARAJA_IDS.length;
  S.barajaSel = BARAJA_IDS[i]; S.nivelSel = progreso(S.barajaSel).abierto; render();
}
function moverNivel(d) {
  const n = Math.max(1, Math.min(progreso(S.barajaSel).abierto, S.nivelSel + d));
  if (n !== S.nivelSel) { S.nivelSel = n; render(); }
}
function vNueva() {
  const b = C.BARAJAS[S.barajaSel], pr = progreso(b.id), i = C.nivelInfo(S.nivelSel);
  const hayC = S.canciones.length > 0;
  const chips = Array.from({ length: C.N_NIVELES }, (_, k) => {
    const n = k + 1, ni = C.nivelInfo(n), abierto = n <= pr.abierto, hecho = pr.superados.includes(n);
    return `<button class="chip-nivel ${ni.fuente} ${n === S.nivelSel ? 'sel' : ''} ${hecho ? 'hecho' : ''}" ${abierto ? `data-acc="nivelSel" data-arg="${n}"` : 'disabled'}>
      <span class="cn-num">${n}</span>${icono(abierto ? ni.fuente : 'candado')}<span class="cn-rej">${C.NOMBRE_REJILLA[ni.rejilla].split(' ')[0]}</span>${hecho ? '<span class="cn-ok">✓</span>' : ''}
    </button>`;
  }).join('');
  const jefes = C.OBJETIVOS.map((_, a) => C.objetivo(S.nivelSel, a + 1, 2));
  return `<div class="pantalla pnueva">
    <h2 class="titulo">Nueva partida</h2>
    <div class="carrusel">
      <button class="flecha" data-acc="barajaMov" data-arg="-1">‹</button>
      <div class="baraja-grande" style="--arte:${b.id === 'barro' ? ZONA_COLOR.mgrave : '#4c5a6e'}">
        <div class="bg-dorso">${icono(BARAJA_ICO[b.id] || 'b_estudio')}</div>
        <div class="bg-info">
          <div class="bg-nombre">${b.nombre}</div>
          <div class="bg-desc">${b.desc}</div>
          <div class="bg-datos">${b.manos} manos · ${b.descartes} descartes · ${pr.superados.length}/${C.N_NIVELES} niveles superados</div>
        </div>
      </div>
      <button class="flecha" data-acc="barajaMov" data-arg="1">›</button>
    </div>
    <div class="puntos-carrusel">${BARAJA_IDS.map(id => `<span class="${id === S.barajaSel ? 'on' : ''}"></span>`).join('')}</div>
    <div class="tira-niveles">${chips}</div>
    <div class="nivel-desc">
      <div class="nd-tit"><span class="nd-num">${S.nivelSel}</span>${i.nombre}</div>
      <div class="tenue">${i.fuente === 'ruido' ? 'Ruido rosa' : hayC ? 'Canciones de tu banco (las que juegues y superes se desbloquean)' : 'Canciones (aún no hay: sonará ruido rosa)'} ·
        ${i.rejilla === 'libre' ? 'marcas el intervalo que quieras' : `eliges una de ${C.BANDAS_REJILLA[i.rejilla].length} bandas`} ·
        ${C.N_ANTES} antes · jefes: ${jefes.join(' · ')}</div>
    </div>
    <div class="cfg">
      <button class="btn ambar grande" id="btn-jugar-nueva" data-acc="jugarNueva">Jugar <kbd>↵</kbd></button>
      <button class="btn" data-acc="menu">Volver</button>
    </div>
    <p class="pie">← → baraja · ↑ ↓ nivel · ↵ jugar</p>
  </div>`;
}

function vJuego() {
  const r = S.run;
  const f = { previa: vPrevia, ciega: vCiega, premio: vPremio, tienda: vTienda, victoria: vFin, derrota: vFin }[r.fase];
  return `<div class="consola fase-${r.fase}">${vBarra(r)}${vRack(r)}${f(r)}</div>`;
}

function vBarra(r) {
  const enCiega = r.fase === 'ciega';
  const progreso = enCiega ? Math.min(1, r.puntos / r.objetivo) : 0;
  return `<header class="barra">
    <div class="b-grupo"><span class="lbl">NIVEL</span>${seg(r.nivel || 4, 'cian', 1)}</div>
    <div class="b-grupo"><span class="lbl">${esc(C.nivelInfo(r.nivel || 4).nombre.toUpperCase())}</span><span class="lbl">ANTE ${r.ante} DE ${C.N_ANTES}</span></div>
    <div class="b-grupo"><span class="lbl">${C.NOMBRE_CIEGA[r.ciega].toUpperCase()}</span>${r.ciega === 2 ? `<span class="jefe-nombre">${C.JEFE[r.jefe].nombre}</span>` : ''}</div>
    ${enCiega ? `
      <div class="b-grupo"><span class="lbl">MANOS</span>${seg(r.manos, 'azul', 1)}</div>
      <div class="b-grupo"><span class="lbl">DESCARTES</span>${seg(r.descartes, 'rojo', 1)}</div>` : '<div class="b-flex"></div>'}
    <div class="b-grupo"><span class="lbl">CAJA · $</span>${seg(r.dinero, 'verde', 3)}</div>
    <button class="btn peq" data-acc="menu">Menú</button>
  </header>`;
}

function vRack(r) {
  const slots = [];
  for (let i = 0; i < C.SLOTS_COMODIN; i++) {
    const j = r.comodines[i];
    if (!j) { slots.push('<div class="unidad vacia"><span>— inserto libre —</span></div>'); continue; }
    const d = C.COMODINES[j.id];
    const col = d.familia ? ZONA_COLOR[d.zona] : TIPO_COLOR[d.tipo];
    slots.push(`<div class="unidad rz-${d.rareza}" data-comodin="${esc(d.nombre)}" style="--arte:${col}" draggable="${!TACTIL}" data-i="${i}" data-acc="detalle" data-arg="${i}">
      <div class="u-mover"><button data-acc="moverComodin" data-arg="${i}:-1" ${i === 0 ? 'disabled' : ''} title="Mover a la izquierda">‹</button><button data-acc="moverComodin" data-arg="${i}:1" ${i === r.comodines.length - 1 ? 'disabled' : ''} title="Mover a la derecha">›</button></div>
      <div class="u-oreja"></div><div class="u-oreja der"></div>
      <div class="u-cab"><span class="u-ico">${iconoComodin(j.id, d)}</span><span class="u-nombre">${esc(d.nombre)}${d.familia ? estrellas(d.nivelFam) : ''}</span><span class="u-led"></span></div>
      <div class="u-desc">${esc(C.descComodin(j))}</div>
      <button class="u-vender" data-acc="vender" data-arg="${i}">vender $${Math.floor(j.precio / 2)}</button>
    </div>`);
  }
  const cons = [];
  for (let i = 0; i < C.SLOTS_CONSUMIBLE; i++) {
    const t = r.consumibles[i];
    cons.push(t ? `<button class="consum" data-acc="usar" data-arg="${i}" title="${esc(C.CONSUMIBLES[t].desc)}" ${r.fase !== 'ciega' ? 'disabled' : ''}>${icono(t)}<span>${C.CONSUMIBLES[t].nombre}</span><small>usar</small></button>`
                : '<div class="consum vacio">—</div>');
  }
  return `<section class="rack"><div class="rack-comodines">${slots.join('')}</div><div class="rack-consum">${cons.join('')}</div></section>`;
}

function vNiveles(r) {
  const b = C.BARAJAS[r.baraja];
  return `<aside class="niveles">${r.fase === 'ciega' ? vMarcador() : ''}
    <div class="niveles-zona"><div class="lbl">NIVELES DE ZONA</div>${C.ZONAS.map(z => {
    const n = r.niveles[z.id], f = b.factor(z.id);
    return `<div class="nivel ${f > 1 ? 'fuerte' : ''}" style="--zona:${ZONA_COLOR[z.id]}">
      <div class="nv-top"><span class="planeta">${icono(ZONA_ICONO[z.id])}${z.nombre}</span><span class="nv">${n.nivel}</span></div>
      <div class="nv-bot"><span class="rng">${C.rangoZona(z)}</span><span><span class="chips">${n0(n.c)}</span>/bit × <span class="mult">${n0(n.m)}</span></span></div>
    </div>`;
  }).join('')}</div></aside>`;
}

// ---------- Marcador de la mano: bits, fichas × mult ----------
const BITS_MAX = Math.log2(C.R_JUEGO / C.W_MIN);
function datosMarcador() {
  const r = S.run;
  if (S.res) {   // resultado: valores finales
    const hit = S.res.hit;
    return { bits: S.res.bits, zona: S.res.zona, cpb: r.niveles[S.res.zona].c, chips: hit ? S.res.chips : 0, mult: hit ? S.res.mult : 0, total: S.res.total, hit, fin: true };
  }
  if (!S.iv) return null;
  const bits = C.bitsDe(S.iv.a, S.iv.b), zona = C.zonaDe(2 ** ((S.iv.a + S.iv.b) / 2)).id, nv = r.niveles[zona];
  return { bits, zona, cpb: nv.c, chips: bits * nv.c, mult: nv.m, total: Math.round(bits * nv.c * nv.m) };
}
const fmtM = x => (x >= 100 ? String(Math.round(x)) : String(+(+x).toFixed(1)).replace('.', ','));
function vMarcador() {
  const r = S.run, d = datosMarcador(), z = d && C.ZONA[d.zona];
  const progreso = Math.min(1, r.puntos / r.objetivo);
  return `<div class="marcador ${d?.fin ? (d.hit ? 'ok' : 'ko') : ''}" id="marcador">
    <div class="mc-ronda">
      <div class="mc-fila"><span class="lbl">OBJETIVO</span>${seg(r.objetivo, '', 5)}</div>
      <div class="mc-fila"><span class="lbl">PUNTOS</span>${seg(r.puntos, 'ambar', 6, S.anim)}</div>
      <div class="progreso"><div style="width:${progreso * 100}%"></div></div>
    </div>
    <div class="mc-mano">
      <div class="mc-zona" style="--zona:${z ? ZONA_COLOR[z.id] : 'transparent'}">${z ? `${icono(ZONA_ICONO[z.id])}${d.fin ? '' : 'si aciertas en '}${z.nombre} · nv ${r.niveles[z.id].nivel}` : 'MANO · marca tu respuesta'}</div>
      <div class="mc-total" id="mc-total">${d ? (d.fin && !d.hit ? 0 : d.fin && S.res.nuevo ? 0 : fmtM(d.total)) : 0}</div>
      <div class="mc-cm">
        <div class="mc-caja chips" id="mc-chips">${d ? fmtM(d.chips) : 0}</div>
        <span class="mc-x">×</span>
        <div class="mc-caja mult" id="mc-mult">${d ? fmtM(d.mult) : 0}</div>
      </div>
      <div class="mc-bits"><span><b>${d ? C.num(d.bits) : '—'}</b> bits${d ? ` × ${n0(d.cpb)}/bit` : ''}</span></div>
      <div class="mc-barra"><div style="width:${d ? Math.min(100, d.bits / BITS_MAX * 100) : 0}%"></div></div>
    </div>
  </div>`;
}
function actualizarMarcador() {
  const el = document.getElementById('marcador'); if (!el || S.res) return;
  el.outerHTML = vMarcador();
}

function vPrevia(r) {
  const hayC = S.canciones.length > 0;
  const tarjetas = [0, 1, 2].map(i => {
    const fuente = C.nivelInfo(r.nivel || 4).fuente, estado = i < r.ciega ? 'hecha' : i === r.ciega ? 'actual' : 'futura';
    const j = i === 2 ? C.JEFE[r.jefe] : null;
    return `<div class="carta ciega ${estado} ${j ? 'jefe' : ''}">
      <div class="ciega-ico">${icono(j ? 'j_' + j.id : 'ciega')}</div>
      <div class="carta-tit">${C.NOMBRE_CIEGA[i]}</div>
      ${j ? `<div class="jefe-nombre">${j.nombre}</div><div class="carta-desc">${j.desc}</div>` : '<div class="carta-desc">Sin restricciones.</div>'}
      <div class="carta-pie">Objetivo <b>${C.objetivo(r.nivel || 4, r.ante, i)}</b> · ${fuente === 'cancion' ? (hayC ? 'Canciones' : 'Ruido rosa (no hay canciones)') : 'Ruido rosa'} · $${C.RECOMPENSA[i]}</div>
      ${estado === 'actual' ? '<button class="btn ambar" data-acc="empezarCiega">Jugar</button>' : estado === 'hecha' ? '<div class="sello">superada</div>' : ''}
    </div>`;
  }).join('');
  return `<div class="cuerpo">${vNiveles(r)}<div class="principal"><div class="cartas">${tarjetas}</div></div></div>`;
}

function vCiega(r) {
  const prm = r.params;
  const canales = r.pistas.map((p, i) => {
    const sel = S.sel === p.id, marc = S.marcadas.has(p.id);
    const fuente = p.src.tipo === 'cancion' ? (S.meta.desbloqueadas.includes(p.src.file) ? esc(nombreCancion(p.src.file)) : '??? <small>canción</small>') : 'Ruido rosa';
    const rz = p.src.tipo === 'cancion' ? rareza(p.src.file) : null;
    return `<div class="canal ${sel ? 'sel' : ''} ${marc ? 'marc' : ''}" data-acc="sel" data-arg="${p.id}">
      <div class="scribble ${rz ? 'rz-' + rz : ''}"><span class="ch">CH ${i + 1}</span><span class="c-fuente">${fuente}</span></div>
      <div class="led ${sel && motor.sonando ? 'on' : ''}"></div>
      <div class="medidor"><div class="med-barra" ${sel ? 'id="medsel"' : ''}></div></div>
      <div class="c-zona">${p.zonaRevelada ? `<span style="color:${ZONA_COLOR[C.zonaDe(p.f).id]}">${icono(ZONA_ICONO[C.zonaDe(p.f).id])}${C.zonaDe(p.f).nombre}</span>` : '· · ·'}</div>
      <button class="btn-marc ${marc ? 'on' : ''}" data-acc="marcar" data-arg="${p.id}">${marc ? 'MARCADA' : 'MARCAR'}</button>
    </div>`;
  }).join('') + (S.cargando ? '<div class="canal cargando">cargando…</div>' : '') + '<div class="master"><span class="lbl">MASTER</span><canvas id="vu" class="vu"></canvas><span class="eq-in" id="eqin">EQ IN</span></div>';
  const jefe = vDescanso() + (r.ciega === 2 ? `<div class="banner-jefe">${C.JEFE[r.jefe].nombre}: ${C.JEFE[r.jefe].desc}</div>` : '');
  return `<div class="cuerpo">${vNiveles(r)}
    <div class="principal">
      ${jefe}
      ${vEQ(prm)}
      <section class="canales">${canales}</section>
      <footer class="transporte">
        <button class="btn" data-acc="alternar" ${!S.sel ? 'disabled' : ''}>${motor.sonando ? '■ Parar' : '▶ Escuchar'} <kbd>espacio</kbd></button>
        <button class="btn" id="btn-bypass" ${prm.noBypass || !S.sel ? 'disabled' : ''}>Bypass <kbd>B</kbd> <span class="largo">mantener</span></button>
        <button class="btn rojo" data-acc="descartar" ${S.res || !S.marcadas.size || r.descartes <= 0 ? 'disabled' : ''}>Descartar ${S.marcadas.size || ''} <kbd>D</kbd></button>
        ${botonComparar()}
        ${S.res ? '<button class="btn ambar" data-acc="continuar">Continuar <kbd>↵</kbd></button>'
                : `<button class="btn ambar" id="btn-jugar" data-acc="jugar" ${!S.sel || !S.iv ? 'disabled' : ''}>Jugar <kbd>↵</kbd></button>`}
      </footer>
      <div class="res-slot">${S.res ? vResultado() : ''}</div>
    </div></div>`;
}

function vEQ(prm) {
  return `<section class="eq">
    <div class="eq-cab"><span class="lbl">EQ · ${prm.gain > 0 ? '+' : ''}${prm.gain} dB · Q ${prm.q}</span>
      <span class="eq-ctrl">${rejilla() === 'libre'
        ? '<button data-acc="ivMover" data-arg="-1" title="Mover a graves">‹</button><button data-acc="ivAncho" data-arg="-1" title="Estrechar">−</button><button data-acc="ivAncho" data-arg="1" title="Ensanchar">+</button><button data-acc="ivMover" data-arg="1" title="Mover a agudos">›</button>'
        : '<button data-acc="ivMover" data-arg="-1" title="Banda anterior">‹</button><button data-acc="ivMover" data-arg="1" title="Banda siguiente">›</button>'}</span>
      <span id="ivinfo" class="iv-info">${textoIv()}</span></div>
    <canvas id="eq"></canvas>
    <div class="eq-ayuda">${rejilla() === 'libre'
      ? 'Arrastra para marcar el intervalo · bordes para ajustar · rueda o ↑↓ para anchura · ←→ para mover (⇧ en tercios)'
      : `Clic en una banda para elegirla · ←→ banda vecina · rejilla: ${C.NOMBRE_REJILLA[rejilla()].toLowerCase()}`}</div>
  </section>`;
}

function botonComparar() {
  return `<button class="btn cian ${S.comparando ? 'activo' : ''}" data-acc="comparar" ${S.res ? '' : 'disabled'}>${S.comparando ? 'Solo el real' : 'Comparar<span class="largo"> con tu respuesta</span>'} <kbd>C</kbd></button>`;
}
function textoIv() {
  if (!S.iv) return 'sin intervalo';
  const { a, b } = S.iv, w = b - a, m = 2 ** ((a + b) / 2);
  if (rejilla() !== 'libre') {
    const bd = C.bandaEn(rejilla(), (a + b) / 2);
    return `banda <b>${bd.nombre}</b> · ${C.fmtHz(2 ** a)} – ${C.fmtHz(2 ** b)} · ${C.num(w)} oct · <b>${C.num(C.bitsDe(a, b))} bits</b>`;
  }
  return `${C.fmtHz(2 ** a)} – ${C.fmtHz(2 ** b)} · ${C.num(w)} oct (${C.num(w * 12, 1)} st) · centro ${C.fmtHz(m)} ${C.fmtNota(m)} · <b>${C.num(C.bitsDe(a, b))} bits</b>`;
}
function actualizarInfo() {
  const el = document.getElementById('ivinfo'); if (el) el.innerHTML = textoIv();
  actualizarMarcador();
  const bj = document.getElementById('btn-jugar'); if (bj) bj.disabled = !S.sel || !S.iv;
  const bm = document.getElementById('btn-responder'); if (bm) bm.disabled = !S.iv;
}

function vResultado() {
  const R = S.res, p = R.pista, z = C.ZONA[C.zonaDe(p.f).id];
  const tit = R.real ? 'ACIERTO' : R.hit ? 'SALVADO' : 'FALLO';
  const s = R.err >= 0 ? '+' : '−';
  const gran = S.pantalla === 'juego' && R.total >= 0.5 * (S.run?.objetivo || Infinity);
  const t = i => (R.nuevo ? i * 260 : 0);
  return `<div class="resultado ${R.hit ? 'ok' : 'ko'} ${gran && R.nuevo ? 'gran' : ''} ${R.nuevo ? 'nuevo' : ''}">
    <div class="res-linea">
      <span class="res-tit">${tit}</span>
      <span><b>${C.fmtHz(p.f)}</b> ${C.fmtNota(p.f)}</span>
      <span style="color:${ZONA_COLOR[z.id]}">${icono(ZONA_ICONO[z.id])} ${z.nombre}</span>
      <span class="tenue">error ${s}${C.num(Math.abs(R.err))} oct (${s}${C.num(Math.abs(R.err * 12), 1)} st)</span>
      ${p.src.tipo === 'cancion' ? `<span class="tenue">· ${esc(nombreCancion(p.src.file))}</span>` : ''}
    </div>
    ${R.log.length ? `<div class="desglose">${R.log.map((l, i) => `<span class="ln ${l.tipo}" style="animation-delay:${t(i)}ms" data-src="${esc(l.src)}" data-t="${t(i)}" data-c="${l.c ?? ''}" data-m="${l.m ?? ''}"><span>${esc(l.src)}</span> <span>${esc(l.tipo === 'base' ? `${fmtM(l.c)} × ${fmtM(l.m)}` : l.txt)}</span></span>`).join('')}${R.veces > 1 ? '<span class="ln x"><span>total</span> <span>×' + R.veces + '</span></span>' : ''}</div>` : ''}
  </div>`;
}

function vPremio(r) {
  const p = r.premio;
  return `<div class="cuerpo">${vNiveles(r)}<div class="principal centrado">
    <div class="panel">
      <h2 class="titulo">${C.NOMBRE_CIEGA[r.ciega]} superada</h2>
      <div class="filas">
        <div><span>Recompensa</span><b>$${p.base}</b></div>
        <div><span>Manos sin usar</span><b>$${p.manos}</b></div>
        <div><span>Interés (1 por cada $5, máx. 5)</span><b>$${p.interes}</b></div>
        ${p.extra ? `<div><span>Comodines</span><b>$${p.extra}</b></div>` : ''}
      </div>
      ${nuevasCanciones(p.nuevas)}
      <button class="btn ambar grande" data-acc="irTienda">Ir a la tienda</button>
    </div></div></div>`;
}
function nuevasCanciones(lista) {
  return lista?.length ? `<div class="nuevas"><div class="lbl">NUEVAS CANCIONES EN TU COLECCIÓN</div>${lista.map(f => `<div class="nueva">${esc(nombreCancion(f))}</div>`).join('')}</div>` : '';
}

function vTienda(r) {
  const t = r.tienda;
  const com = t.comodines.map((o, i) => {
    return cartaComodin(o.id, { pie: `<button class="btn ambar" data-acc="comprarComodin" data-arg="${i}" ${r.dinero < o.precio || r.comodines.length >= C.SLOTS_COMODIN ? 'disabled' : ''}>Comprar $${o.precio}</button>` });
  }).join('') || '<div class="tenue">Agotado</div>';
  const its = t.items.map((o, i) => {
    const lleno = o.tipo !== 'planeta' && r.consumibles.length >= C.SLOTS_CONSUMIBLE;
    const pie = `<button class="btn ambar" data-acc="comprarItem" data-arg="${i}" ${r.dinero < o.precio || lleno ? 'disabled' : ''}>Comprar $${o.precio}</button>`;
    if (o.tipo === 'planeta') {
      const z = C.ZONA[o.zona], f = C.BARAJAS[r.baraja].factor(o.zona), nv = r.niveles[o.zona].nivel;
      return cartaSimple({ ico: ZONA_ICONO[z.id], color: ZONA_COLOR[z.id], estilo: `--zona:${ZONA_COLOR[z.id]}`, nombre: `${z.nombre} · nv ${nv} → ${nv + 1}`, etiqueta: 'mejora de zona', clase: 'mejora',
        desc: `${C.rangoZona(z)}: +${n0(C.NIVEL_INC.c * f)} fichas/bit, +${n0(C.NIVEL_INC.m * f)} mult.`, pie });
    }
    return cartaSimple({ ico: o.tipo, color: '#7a55b0', nombre: C.CONSUMIBLES[o.tipo].nombre, etiqueta: 'consumible', clase: 'consumible', desc: C.CONSUMIBLES[o.tipo].desc, pie });
  }).join('') || '<div class="tenue">Agotado</div>';
  return `<div class="cuerpo">${vNiveles(r)}<div class="principal">
    <h2 class="titulo">Tienda</h2>
    <div class="lbl">COMODINES</div><div class="cartas">${com}</div>
    <div class="lbl">MEJORAS DE ZONA Y CONSUMIBLES</div><div class="cartas">${its}</div>
    <div class="transporte">
      <button class="btn" data-acc="reroll" ${r.dinero < r.reroll ? 'disabled' : ''}>Renovar $${r.reroll}</button>
      <button class="btn ambar grande" data-acc="siguiente">Siguiente ciega</button>
    </div>
  </div></div>`;
}

function vFin(r) {
  const gano = r.fase === 'victoria', s = r.stats;
  return `<div class="cuerpo">${vNiveles(r)}<div class="principal centrado"><div class="panel">
    <h2 class="titulo ${gano ? 'verde' : 'rojo'}">${gano ? 'Partida ganada' : 'Fin de la partida'}</h2>
    ${!gano ? `<p>${C.NOMBRE_CIEGA[r.ciega]} del ante ${r.ante}: ${r.puntos} de ${r.objetivo} puntos.</p>` : ''}
    <div class="filas">
      <div><span>Baraja</span><b>${C.BARAJAS[r.baraja].nombre}</b></div>
      <div><span>Nivel</span><b>${r.nivel || 4} · ${C.nivelInfo(r.nivel || 4).nombre}</b></div>
      <div><span>Manos jugadas</span><b>${s.manos}</b></div>
      <div><span>Aciertos</span><b>${s.aciertos} (${s.manos ? pct(s.aciertos / s.manos) : '—'})</b></div>
      <div><span>Mejor mano</span><b>${s.mejor}</b></div>
    </div>
    ${gano ? nuevasCanciones(r.premio?.nuevas) : ''}
    ${haySiguiente(r)
      ? `${r.nivel + 1 > 0 ? `<p class="verde-t">Nivel ${r.nivel + 1} desbloqueado: ${C.nivelInfo(r.nivel + 1).nombre}</p>` : ''}
         <button class="btn ambar grande" id="btn-otra" data-acc="siguienteNivel">Siguiente nivel <kbd>↵</kbd></button>`
      : `<button class="btn ambar grande" id="btn-otra" data-acc="reintentar">Volver a jugar <kbd>↵</kbd></button>`}
    <div class="fin-sec">
      ${haySiguiente(r) ? '<button class="btn" data-acc="reintentar">Repetir nivel <kbd>R</kbd></button>' : ''}
      <button class="btn" data-acc="elegirBaraja" data-arg="${r.baraja}">Niveles</button>
      <button class="btn" data-acc="menu">Menú</button>
    </div>
  </div></div></div>`;
}

function vMedicion() {
  const m = S.med, c = m.config;
  if (m.activo) {
    return `<div class="consola fase-ciega medicion">
      <header class="barra"><div class="b-grupo"><span class="lbl">MODO MEDICIÓN</span><span class="seg">${m.i + 1}/${c.n}</span></div>
      <div class="b-grupo"><span class="lbl">RANGO</span><span class="seg">${c.rango === 'medios' ? '250–1000' : 'completo'}</span></div><div class="b-flex"></div>
      <button class="btn peq" data-acc="menu">Salir</button></header>
      <div class="principal">${vDescanso()}${vEQ(m.params)}
        <footer class="transporte">
          <button class="btn" data-acc="alternar">${motor.sonando ? '■ Parar' : '▶ Escuchar'} <kbd>espacio</kbd></button>
          <button class="btn" id="btn-bypass">Bypass <kbd>B</kbd> <span class="largo">mantener</span></button>
          ${botonComparar()}
          ${S.res ? '<button class="btn ambar" data-acc="medContinuar">Siguiente <kbd>↵</kbd></button>'
                  : `<button class="btn ambar" id="btn-responder" data-acc="medResponder" ${!S.iv ? 'disabled' : ''}>Responder <kbd>↵</kbd></button>`}
          <span class="eq-in" id="eqin">EQ IN</span><canvas id="vu" class="vu"></canvas>
        </footer>
        <div class="res-slot">${S.res ? vResultado() : ''}</div>
      </div></div>`;
  }
  const op = (k, v, txt) => `<button class="btn ${c[k] === v ? 'ambar' : ''}" data-acc="medCfg" data-arg="${k}:${v}">${txt}</button>`;
  const res = m.fin ? ST.metricas(m.hechos) : null;
  return `<div class="pantalla">
    <h2 class="titulo">Modo medición</h2>
    <p class="tenue">Protocolo fijo: +12 dB, Q 2, sin comodines. Sirve para comparar con tus series anteriores.</p>
    <div class="cfg"><span class="lbl">RANGO</span>${op('rango', 'completo', 'Completo')}${op('rango', 'medios', '250–1000 Hz')}</div>
    <div class="cfg"><span class="lbl">FUENTE</span>${op('fuente', 'ruido', 'Ruido rosa')}${op('fuente', 'cancion', 'Canciones desbloqueadas')}</div>
    <div class="cfg"><span class="lbl">ESCUCHA</span>${op('pres', 'ab', 'A/B automático')}${op('pres', 'continua', 'Continua (como en Ableton)')}</div>
    <div class="cfg"><span class="lbl">PRUEBAS</span>${op('n', 10, '10')}${op('n', 20, '20')}${op('n', 34, '34')}</div>
    <button class="btn ambar grande" data-acc="medEmpezar">Empezar</button>
    ${res ? `<h3 class="titulo">Resultado de la sesión</h3>${tablaMetricas(res)}` : ''}
    <button class="btn" data-acc="menu">Volver</button>
  </div>`;
}

function filtrar(ts) {
  return ts.filter(t => S.filtro === 'todas' || (S.filtro === 'partida' && t.modo === 'partida') ||
    (S.filtro.startsWith('rej-') && t.modo === 'partida' && (t.rejilla || 'libre') === S.filtro.slice(4)) ||
    (S.filtro === 'med-completo' && t.modo === 'medicion' && t.rango === 'completo') ||
    (S.filtro === 'med-medios' && t.modo === 'medicion' && t.rango === '250-1000'));
}
function tablaMetricas(m) {
  if (!m) return '<p class="tenue">Sin datos.</p>';
  const o = x => C.num(x);
  return `<div class="metricas">
    <div><span>Pruebas</span><b>${m.n}</b></div>
    <div><span>Error medio</span><b>${o(m.mae)} oct · ${C.num(m.mae * 12, 1)} st</b></div>
    <div><span>Mediana</span><b>${o(m.mediana)} oct</b></div>
    <div><span>Sesgo</span><b>${m.sesgo >= 0 ? '+' : '−'}${o(Math.abs(m.sesgo))} oct</b></div>
    <div><span>Desviación típica</span><b>${o(m.sd)} oct</b></div>
    <div><span>≤ 1 semitono</span><b>${pct(m.st1)}</b></div>
    <div><span>≤ 2 semitonos</span><b>${pct(m.st2)}</b></div>
    <div><span>≤ ⅓ octava</span><b>${pct(m.ter)}</b></div>
    <div><span>≤ 1 octava</span><b>${pct(m.oct)}</b></div>
    <div><span>Cobertura del intervalo</span><b>${pct(m.cobertura)}</b></div>
    <div><span>Anchura media</span><b>${o(m.anchura)} oct</b></div>
    <div><span>Bits medios (aciertos)</span><b>${o(m.bits)}</b></div>
  </div>`;
}
function vStats() {
  const ts = filtrar(S.historial);
  const f = (id, txt) => `<button class="btn ${S.filtro === id ? 'ambar' : ''}" data-acc="filtro" data-arg="${id}">${txt}</button>`;
  const zonas = ST.porZona(ts).map(({ zona, m }) => `<tr><td>${zona.nombre}</td><td>${C.rangoZona(zona)}</td>
    <td>${m ? m.n : 0}</td><td>${m ? C.num(m.mae) : '—'}</td><td>${m ? (m.sesgo >= 0 ? '+' : '−') + C.num(Math.abs(m.sesgo)) : '—'}</td>
    <td>${m ? C.num(m.sd) : '—'}</td><td>${m ? pct(m.cobertura) : '—'}</td><td>${m ? C.num(m.anchura) : '—'}</td></tr>`).join('');
  return `<div class="pantalla ancha">
    <h2 class="titulo">Estadísticas</h2>
    <div class="cfg">${f('todas', 'Todo')}${f('partida', 'Partidas')}${C.REJILLAS.map(r => f('rej-' + r, C.NOMBRE_REJILLA[r])).join('')}${f('med-completo', 'Medición · completo')}${f('med-medios', 'Medición · 250–1000')}</div>
    ${tablaMetricas(ST.metricas(ts))}
    <table class="tabla"><thead><tr><th>Zona</th><th>Rango</th><th>n</th><th>Error (oct)</th><th>Sesgo</th><th>σ</th><th>Cobertura</th><th>Anchura</th></tr></thead><tbody>${zonas}</tbody></table>
    <p class="tenue">Error = log₂(centro del intervalo / frecuencia real). Zona más débil ahora: <b>${C.ZONA[ST.zonaMasDebil(S.historial)].nombre}</b>.</p>
    <div class="cfg"><button class="btn" data-acc="exportar">Exportar CSV</button><button class="btn" data-acc="pantalla" data-arg="datos">Copia de seguridad</button><button class="btn" data-acc="menu">Volver</button></div>
  </div>`;
}
function vDatos() {
  return `<div class="pantalla">
    <h2 class="titulo">Copia de seguridad</h2>
    <p class="tenue">Tu progreso y tu historial se guardan en este dispositivo. Para pasarlos a otro (del Mac al móvil o al revés), exporta aquí e importa allí. Las canciones no van en la copia: añádelas en cada dispositivo.</p>
    <div class="cfg"><button class="btn ambar" data-acc="exportarCopia">Exportar copia (.json)</button>
      <label class="btn">Importar…<input type="file" accept=".json,.jsonl,application/json" multiple hidden data-entrada="copia"></label></div>
    <p class="tenue">Importar acepta una copia de PICO, o los archivos de la versión de escritorio: <b>estado.json</b> y <b>historial.jsonl</b> (selecciona los dos a la vez). <b>Reemplaza</b> los datos de este dispositivo.</p>
    <p class="tenue">${S.historial.length} pruebas · ${S.meta.victorias || 0} partidas ganadas · <span id="espacio"></span></p>
    <button class="btn" data-acc="menu">Volver</button>
  </div>`;
}
async function mostrarEspacio() {
  const el = document.getElementById('espacio'); if (!el) return;
  const e = await A.espacio(); if (!e) return;
  el.textContent = `${(e.usado / 1048576).toFixed(0)} MB usados de ${(e.cuota / 1048576 / 1024).toFixed(1)} GB disponibles`;
}
async function entradaArchivos(tipo, files) {
  if (!files.length) return;
  try {
    if (tipo === 'canciones') {
      S.aviso = 'Guardando canciones…'; render();
      const nuevas = await A.anadirCanciones(files);
      S.canciones = await A.listarCanciones();
      S.aviso = null; avisar(`${nuevas.length} canción(es) añadida(s) al banco.`);
    } else if (tipo === 'copia') {
      const r = await A.importar(files);
      S.meta = await A.leerEstado(); S.meta.desbloqueadas ||= []; S.meta.canciones ||= {};
      S.historial = await A.leerHistorial(); S.run = null;
      avisar(`Importado: ${r.estado ? 'progreso' : ''}${r.estado && r.ensayos !== null ? ' y ' : ''}${r.ensayos !== null ? r.ensayos + ' pruebas' : ''}.`);
    }
  } catch (e) { S.aviso = null; avisar('Error: ' + e.message); }
}
app.addEventListener('change', e => {
  const t = e.target.closest?.('input[data-entrada]'); if (!t) return;
  entradaArchivos(t.dataset.entrada, [...t.files]); t.value = '';
});

function vColeccion() {
  const des = new Set(desbloqueadas());
  const filas = S.canciones.map(f => {
    const quitar = `<button class="tc-quitar" data-acc="quitarCancion" data-arg="${esc(f)}" title="Quitar del banco">×</button>`;
    if (!des.has(f)) return `<div class="tarjeta-c bloqueada">${quitar}<div class="tc-tit">???</div><div class="tenue">bloqueada</div></div>`;
    const ts = S.historial.filter(t => t.cancion === f), m = ST.metricas(ts), rz = rareza(f);
    return `<div class="tarjeta-c ${rz ? 'rz-' + rz : ''}">${quitar}<div class="tc-tit">${esc(nombreCancion(f))}</div>
      <div class="tenue">${rz || 'sin analizar'}${S.meta.canciones[f] ? ' · ' + Math.round(S.meta.canciones[f].dur / 60) + ' min' : ''}</div>
      <div class="tenue">${m ? `${m.n} pruebas · error ${C.num(m.mae)} oct` : 'sin pruebas'}</div></div>`;
  }).join('');
  return `<div class="pantalla ancha">
    <h2 class="titulo">Colección · ${des.size}/${S.canciones.length}</h2>
    <p class="tenue">Una canción se desbloquea cuando te sale en una ciega, la juegas (aciertes o no) y superas esa ciega. La rareza sale de la densidad espectral de la mezcla (planitud entre 50 Hz y 12 kHz) relativa a tu banco.</p>
    <div class="cfg">
      <label class="btn ambar">Añadir canciones<input type="file" accept="audio/*,.wav,.mp3,.flac,.m4a,.aiff,.aif,.ogg" multiple hidden data-entrada="canciones"></label>
      <button class="btn" data-acc="menu">Volver</button>
      <span class="tenue" id="espacio"></span>
    </div>
    <p class="tenue">Las canciones se guardan solo en este dispositivo, dentro del navegador; no se suben a ningún sitio. Mejor mezclas completas que temas muy desnudos.</p>
    <div class="coleccion">${filas || '<p class="tenue">Aún no hay canciones. Añádelas con el botón: en el móvil se abren Archivos o tu biblioteca.</p>'}</div>
  </div>`;
}

// ---------- Canvas del EQ ----------
const FREQS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const MENORES = [30, 40, 60, 70, 80, 90, 300, 400, 600, 700, 800, 900, 3000, 4000, 6000, 7000, 8000, 9000, 150, 1500, 15000];
const xDeLf = lf => S.geo.L + (lf - C.LF_MIN) / C.R_OCT * (S.geo.R - S.geo.L);
const lfDeX = x => C.LF_MIN + Math.min(1, Math.max(0, (x - S.geo.L) / (S.geo.R - S.geo.L))) * C.R_OCT;

function montarCanvas() {
  const cv = document.getElementById('eq'); if (!cv) return;
  cv.onpointerdown = e => {
    if (S.res) return;
    if (rejilla() !== 'libre') {
      const bd = C.bandaEn(rejilla(), lfDeX(e.offsetX));
      S.iv = { a: bd.a, b: bd.b }; render(); return;
    }
    cv.setPointerCapture(e.pointerId);
    const x = e.offsetX, lf = lfDeX(x), iv = S.iv;
    if (iv) {
      const xa = xDeLf(iv.a), xb = xDeLf(iv.b);
      const TOL = e.pointerType === 'touch' ? 24 : 8;
      if (Math.abs(x - xa) < TOL || Math.abs(x - xb) < TOL) S.drag = { m: 'borde', mid: (iv.a + iv.b) / 2 };
      else if (x > xa && x < xb) S.drag = { m: 'mov', off: lf - iv.a, w: iv.b - iv.a };
    }
    if (!S.drag) { S.iv = { a: lf, b: lf }; S.drag = { m: 'nuevo', ancla: lf, x0: x }; }
  };
  cv.onpointermove = e => {
    const lf = lfDeX(e.offsetX); S.hover = lf;
    const d = S.drag;
    if (!d && rejilla() !== 'libre') { cv.style.cursor = S.res ? 'default' : 'pointer'; return; }
    if (!d) {
      const iv = S.iv, x = e.offsetX;
      cv.style.cursor = S.res || !iv ? 'crosshair'
        : (Math.abs(x - xDeLf(iv.a)) < 8 || Math.abs(x - xDeLf(iv.b)) < 8) ? 'ew-resize'
        : (x > xDeLf(iv.a) && x < xDeLf(iv.b)) ? 'grab' : 'crosshair';
      return;
    }
    const iv = S.iv;
    if (d.m === 'borde') {   // el centro queda fijo; los dos bordes se abren o cierran a la vez (simétrico en log)
      const h = Math.max(C.W_MIN / 2, Math.min(Math.abs(lf - d.mid), d.mid - C.LF_MIN, C.LF_MAX - d.mid));
      iv.a = d.mid - h; iv.b = d.mid + h;
    }
    else if (d.m === 'mov') { const a = Math.max(C.LF_MIN, Math.min(lf - d.off, C.LF_MAX - d.w)); iv.a = a; iv.b = a + d.w; }
    else { iv.a = Math.min(d.ancla, lf); iv.b = Math.max(d.ancla, lf); }
    actualizarInfo();
  };
  cv.onpointerup = e => {
    if (e.pointerType === 'touch') S.hover = null;   // con el dedo no hay cursor que seguir
    const d = S.drag; S.drag = null; if (!d) return;
    if (d.m === 'nuevo' && Math.abs(e.offsetX - d.x0) < 4) fijarIv(d.ancla - 1 / 6, d.ancla + 1 / 6); // clic simple: ⅓ de octava
    else fijarIv(S.iv.a, S.iv.b);
    render();
  };
  cv.onpointerleave = () => { S.hover = null; };
  cv.onwheel = e => {
    if (!S.iv || S.res) return;
    e.preventDefault();
    const d = e.deltaY > 0 ? 1 / 24 : -1 / 24;
    fijarIv(S.iv.a - d, S.iv.b + d); actualizarInfo();
  };
}

function dibujar() {
  const cv = document.getElementById('eq');
  if (cv) dibujarEQ(cv);
  const rms = motor.nivel(), db = 20 * Math.log10(rms + 1e-9);
  const m = document.getElementById('medsel');
  if (m) m.style.setProperty('--nivel', Math.max(0, Math.min(1, (db + 48) / 48)));
  const led = document.getElementById('eqin');
  if (led) {
    const f = motor.fase;
    led.textContent = f || (S.comparando ? 'TÚ · REAL' : 'EQ IN');
    led.classList.toggle('on', !!f);
    led.classList.toggle('real', f === 'REAL');
  }
  const vu = document.getElementById('vu');
  if (vu) dibujarVU(vu, db);
  requestAnimationFrame(dibujar);
}

function dibujarEQ(cv) {
  const g = cv.getContext('2d'), dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const L = 34, R = W - 14, T = 22, B = H - 34;
  S.geo = { L, R };
  const X = lf => xDeLf(lf), Y = db => T + (18 - db) / 36 * (B - T);
  const css = getComputedStyle(document.documentElement), col = n => css.getPropertyValue(n).trim();

  g.fillStyle = col('--pantalla'); g.fillRect(0, 0, W, H);
  // zonas
  C.ZONAS.forEach((z, i) => {
    const x0 = X(Math.log2(z.lo)), x1 = X(Math.log2(z.hi));
    if (i % 2) { g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(x0, T, x1 - x0, B - T); }
    g.fillStyle = ZONA_COLOR[z.id]; g.globalAlpha = 0.85; g.font = '10px ui-monospace, Menlo, monospace'; g.textAlign = 'center';
    g.fillText(z.nombre.toUpperCase(), (x0 + x1) / 2, 14); g.globalAlpha = 1;
    g.fillRect(x0 + 1, 17, x1 - x0 - 2, 2);
  });
  // fuera del rango de juego (no salen picos)
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(L, T, X(C.LG_MIN) - L, B - T); g.fillRect(X(C.LG_MAX), T, R - X(C.LG_MAX), B - T);
  g.strokeStyle = 'rgba(255,179,71,0.25)'; g.setLineDash([2, 4]);
  [C.LG_MIN, C.LG_MAX].forEach(lf => { const x = Math.round(X(lf)) + 0.5; g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke(); });
  g.setLineDash([]);
  // rejilla
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(120,200,160,0.07)';
  MENORES.forEach(f => { const x = Math.round(X(Math.log2(f))) + 0.5; g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke(); });
  g.strokeStyle = 'rgba(120,200,160,0.18)'; g.fillStyle = col('--tenue'); g.textAlign = 'center';
  FREQS.forEach(f => {
    const x = Math.round(X(Math.log2(f))) + 0.5;
    g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke();
    g.fillText(f >= 1000 ? f / 1000 + 'k' : f, x, B + 13);
  });
  g.textAlign = 'right';
  [-12, -6, 0, 6, 12].forEach(db => {
    const y = Math.round(Y(db)) + 0.5;
    g.strokeStyle = db === 0 ? 'rgba(120,200,160,0.3)' : 'rgba(120,200,160,0.1)';
    g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke();
    g.fillText((db > 0 ? '+' : '') + db, L - 6, y + 3);
  });
  // Do de cada octava
  g.textAlign = 'center'; g.fillStyle = 'rgba(200,200,200,0.35)';
  for (let o = 1; o <= 9; o++) { const f = 261.6256 * 2 ** (o - 4); if (f < C.F_MIN || f > C.F_MAX) continue; const x = X(Math.log2(f)); g.fillRect(x - 0.5, B - 5, 1, 5); g.fillText('Do' + o, x, B + 26); }

  // rejilla de respuesta (niveles por bandas)
  if (rejilla() !== 'libre') {
    const l = C.BANDAS_REJILLA[rejilla()];
    g.strokeStyle = 'rgba(255,179,71,0.22)'; g.lineWidth = 1;
    l.forEach(bd => { const x = Math.round(X(bd.a)) + 0.5; g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke(); });
    if (S.hover !== null && !S.res && S.hover >= C.LG_MIN && S.hover <= C.LG_MAX) {
      const bd = C.bandaEn(rejilla(), S.hover);
      g.fillStyle = 'rgba(255,179,71,0.08)'; g.fillRect(X(bd.a), T, X(bd.b) - X(bd.a), B - T);
    }
    if (rejilla() !== 'zonas') {
      g.fillStyle = 'rgba(255,179,71,0.55)'; g.textAlign = 'center'; g.font = '9px ui-monospace, Menlo, monospace';
      l.forEach((bd, i) => { if (rejilla() === 'tercios' && i % 2) return; g.fillText(bd.nombre.replace(' Hz', '').replace(' kHz', 'k'), (X(bd.a) + X(bd.b)) / 2, B - 6); });
    }
  }
  // intervalo
  if (S.iv) {
    const xa = X(S.iv.a), xb = X(S.iv.b);
    const tono = S.res ? (S.res.hit ? col('--verde') : col('--rojo')) : col('--ambar');
    g.fillStyle = tono; g.globalAlpha = 0.16; g.fillRect(xa, T, xb - xa, B - T); g.globalAlpha = 1;
    g.strokeStyle = tono; g.lineWidth = 2;
    [xa, xb].forEach(x => { g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke(); g.fillStyle = tono; g.fillRect(x - 4, (T + B) / 2 - 10, 8, 20); });
    g.lineWidth = 1; g.setLineDash([3, 3]);
    const xm = (xa + xb) / 2; g.beginPath(); g.moveTo(xm, T); g.lineTo(xm, B); g.stroke(); g.setLineDash([]);
  }
  // RTA: solo con el pico ya revelado
  if (S.res && motor.sonando) dibujarRTA(g, L, R, T, B, Y, col);
  // resultado: curva real y marcador
  if (S.res) {
    const p = S.res.pista, prm = params();
    g.strokeStyle = col('--cian'); g.lineWidth = 2; g.beginPath();
    for (let x = L; x <= R; x += 2) {
      const f = 2 ** lfDeX(x), db = 20 * Math.log10(magH(p.f, prm.q, prm.gain, f));
      x === L ? g.moveTo(x, Y(db)) : g.lineTo(x, Y(db));
    }
    g.stroke(); g.lineWidth = 1;
    if (S.comparando) {
      const tu = 2 ** ((S.res.a + S.res.b) / 2), activa = motor.fase;
      g.strokeStyle = col('--ambar'); g.lineWidth = activa === 'TÚ' ? 2.5 : 1.2; g.setLineDash([5, 4]); g.beginPath();
      for (let x = L; x <= R; x += 2) {
        const db = 20 * Math.log10(magH(tu, prm.q, prm.gain, 2 ** lfDeX(x)));
        x === L ? g.moveTo(x, Y(db)) : g.lineTo(x, Y(db));
      }
      g.stroke(); g.setLineDash([]); g.lineWidth = 1;
      const xt = X(Math.log2(tu));
      g.fillStyle = col('--ambar'); g.textAlign = xt > R - 120 ? 'right' : 'left';
      g.fillText(`tú: ${C.fmtHz(tu)} · ${C.fmtNota(tu)}`, xt + (xt > R - 120 ? -6 : 6), Y(prm.gain > 0 ? prm.gain : 0) + 14);
    }
    const xr = X(Math.log2(p.f));
    g.fillStyle = col('--cian'); g.textAlign = xr > R - 80 ? 'right' : 'left';
    g.fillText(`${C.fmtHz(p.f)} · ${C.fmtNota(p.f)}`, xr + (xr > R - 80 ? -6 : 6), Y(prm.gain > 0 ? prm.gain : 0) - 6);
  }
  // cursor
  if (S.hover !== null && !S.drag) {
    const x = X(S.hover), f = 2 ** S.hover;
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke();
    g.fillStyle = col('--texto'); g.textAlign = x > R - 120 ? 'right' : 'left';
    g.fillText(`${C.fmtHz(f)} · ${C.fmtNota(f)}`, x + (x > R - 120 ? -6 : 6), T + 12);
  }
}

// ---------- Arranque ----------
(async function arrancar() {
  try {
    S.meta = await A.leerEstado();
    S.canciones = await A.listarCanciones();
    S.historial = await A.leerHistorial();
    A.persistir();
  } catch {
    app.innerHTML = '<div class="pantalla"><h2 class="titulo">No se puede guardar</h2><p>Este navegador no deja usar el almacenamiento local (¿modo privado?). Ábrelo en una ventana normal.</p></div>';
    return;
  }
  S.meta.desbloqueadas ||= []; S.meta.canciones ||= {};
  render();
  requestAnimationFrame(dibujar);
})();
// Aviso de descanso por tiempo de escucha en la mesa (no por rendimiento)
S.tMesa = 0; S.descanso = false;
setInterval(() => {
  if (!enMesa() || document.visibilityState !== 'visible') return;
  if (++S.tMesa >= 20 * 60 && !S.descanso) { S.descanso = true; if (!S.drag) render(); }
}, 1000);
motor.onParada = () => { if (!S.drag) render(); };
function vDescanso() {
  return S.descanso ? `<div class="banner-descanso"><span>Llevas 20 minutos escuchando. Para un par de minutos en silencio: la adaptación auditiva se recupera en pocos minutos.</span>
    <button class="btn peq" data-acc="descansoOk">Hecho</button></div>` : '';
}
// el botón principal de fin de partida recibe el foco: un toque de teclado o clic y vuelves a estar dentro
new MutationObserver(() => document.getElementById('btn-otra')?.focus({ preventScroll: true })).observe(app, { childList: true });

// ---------- LED de 7 segmentos ----------
function seg(valor, color, digitos, anim) {
  const v = String(valor), n = Math.max(digitos, v.length);
  const cuenta = anim ? ` data-cuenta="${valor}" data-desde="${anim.desde}" data-retardo="${anim.retardo}"` : '';
  return `<span class="seg ${color}"><span class="fant">${'8'.repeat(n)}</span><span class="val"${cuenta}>${anim ? anim.desde : v}</span></span>`;
}

// ---------- Animaciones tras render ----------
function animar() {
  document.querySelectorAll('[data-cuenta]').forEach(el => {
    const hasta = +el.dataset.cuenta, desde = +(el.dataset.desde || 0), ret = +(el.dataset.retardo || 0), dur = 650;
    const t0 = performance.now() + ret;
    const paso = t => {
      const k = Math.max(0, Math.min(1, (t - t0) / dur)), e = 1 - (1 - k) ** 3;
      el.textContent = Math.round(desde + (hasta - desde) * e);
      if (k < 1) requestAnimationFrame(paso); else el.classList.add('golpe');
    };
    requestAnimationFrame(paso);
  });
  if (S.res?.nuevo && S.res.hit) {
    // las cajas de fichas y mult saltan a cada valor del desglose
    const ch = document.getElementById('mc-chips'), mu = document.getElementById('mc-mult'), to = document.getElementById('mc-total');
    if (ch && mu) {
      ch.textContent = 0; mu.textContent = 0; if (to) to.textContent = 0;
      const fmt = fmtM;
      const lns = [...document.querySelectorAll('.desglose .ln[data-src]')];
      const tFin = lns.length ? +lns[lns.length - 1].dataset.t + 260 : 0;
      setTimeout(() => { if (to) { to.textContent = fmt(S.res?.total ?? 0); to.classList.remove('salta'); void to.offsetWidth; to.classList.add('salta'); } }, tFin);
      const golpe = el => { el.classList.remove('salta'); void el.offsetWidth; el.classList.add('salta'); };
      document.querySelectorAll('.desglose .ln[data-src]').forEach(ln => {
        if (ln.dataset.c === '' || (+ln.dataset.c === 0 && +ln.dataset.m === 0)) return;
        setTimeout(() => {
          if (ch.textContent !== fmt(ln.dataset.c)) { ch.textContent = fmt(ln.dataset.c); golpe(ch); }
          if (mu.textContent !== fmt(ln.dataset.m)) { mu.textContent = fmt(ln.dataset.m); golpe(mu); }
          if (to) to.textContent = fmt(+ln.dataset.c * +ln.dataset.m);
        }, +ln.dataset.t);
      });
    }
  }
  if (S.res?.nuevo) {
    // los insertos que intervinieron se iluminan en el orden del desglose
    document.querySelectorAll('.desglose .ln[data-src]').forEach(ln => {
      const u = document.querySelector(`.unidad[data-comodin="${CSS.escape(ln.dataset.src)}"]`);
      if (u) setTimeout(() => { u.classList.remove('dispara'); void u.offsetWidth; u.classList.add('dispara'); }, +ln.dataset.t);
    });
    S.res.nuevo = false;
  }
}

// ---------- Vúmetro de aguja (0 VU = −18 dBFS RMS, integración ~300 ms) ----------
const vuEstado = { v: -20, t: 0 };
function dibujarVU(cv, dbfs) {
  const g = cv.getContext('2d'), dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ahora = performance.now(), dt = Math.min(0.1, (ahora - (vuEstado.t || ahora)) / 1000); vuEstado.t = ahora;
  const obj = Math.max(-20, Math.min(3, dbfs + 18));
  vuEstado.v += (obj - vuEstado.v) * (1 - Math.exp(-dt / 0.065));
  const cx = W / 2, cy = H * 1.55, r = H * 1.3, ang = vu => -0.75 + (Math.min(3, Math.max(-20, vu)) + 20) / 23 * 1.5;
  const fondo = g.createLinearGradient(0, 0, 0, H); fondo.addColorStop(0, '#f6e7bf'); fondo.addColorStop(1, '#e2cc92');
  g.fillStyle = fondo; g.fillRect(0, 0, W, H);
  g.lineWidth = 1.2; g.strokeStyle = '#2a2418';
  g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2 + ang(-20), -Math.PI / 2 + ang(0)); g.stroke();
  g.strokeStyle = '#c0321f'; g.lineWidth = 3;
  g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2 + ang(0), -Math.PI / 2 + ang(3)); g.stroke();
  g.font = '8px ui-monospace, Menlo, monospace'; g.textAlign = 'center';
  [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3].forEach(v => {
    const a = -Math.PI / 2 + ang(v), c = Math.cos(a), s = Math.sin(a);
    g.strokeStyle = v > 0 ? '#c0321f' : '#2a2418'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx + c * r, cy + s * r); g.lineTo(cx + c * (r - 6), cy + s * (r - 6)); g.stroke();
    if ([-20, -10, -5, -3, 0, 3].includes(v)) { g.fillStyle = v > 0 ? '#c0321f' : '#2a2418'; g.fillText(v > 0 ? '+' + v : v, cx + c * (r + 8), cy + s * (r + 8) + 3); }
  });
  g.fillStyle = '#2a2418'; g.font = 'bold 10px ui-monospace, Menlo, monospace'; g.fillText('VU', cx, H - 8);
  const a = -Math.PI / 2 + ang(vuEstado.v);
  g.strokeStyle = '#111'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r + 4), cy + Math.sin(a) * (r + 4)); g.stroke();
  const brillo = g.createLinearGradient(0, 0, 0, H * 0.5); brillo.addColorStop(0, 'rgba(255,255,255,0.35)'); brillo.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = brillo; g.fillRect(0, 0, W, H * 0.5);
}

// ---------- RTA tras revelar (con +3 dB/oct para que el ruido rosa se vea plano) ----------
let rtaBuf = null;
function dibujarRTA(g, L, R, T, B, Y, col) {
  const an = motor.analizador, n = an.frequencyBinCount, hz = motor.ctx.sampleRate / an.fftSize;
  if (!rtaBuf || rtaBuf.length !== n) rtaBuf = new Float32Array(n);
  an.getFloatFrequencyData(rtaBuf);
  const pts = [];
  for (let x = L; x <= R; x += 3) {
    const f1 = 2 ** lfDeX(x - 1.5), f2 = 2 ** lfDeX(x + 1.5);
    let i1 = Math.floor(f1 / hz), i2 = Math.max(i1, Math.ceil(f2 / hz)), p = 0;
    for (let i = i1; i <= i2 && i < n; i++) p += 10 ** (rtaBuf[i] / 10);
    p /= (i2 - i1 + 1);
    const fc = Math.sqrt(f1 * f2);
    pts.push([x, 10 * Math.log10(p + 1e-20) + 10 * Math.log10(fc / 1000)]);
  }
  const medios = pts.filter(([x]) => { const f = 2 ** lfDeX(x); return f > 100 && f < 8000; }).map(p => p[1]).sort((a, b) => a - b);
  const ref = medios[Math.floor(medios.length / 2)] || 0;
  g.beginPath(); g.moveTo(L, B);
  pts.forEach(([x, d]) => g.lineTo(x, Math.max(T, Math.min(B, Y(d - ref)))));
  g.lineTo(R, B); g.closePath();
  const gr = g.createLinearGradient(0, T, 0, B); gr.addColorStop(0, 'rgba(99,240,143,0.35)'); gr.addColorStop(1, 'rgba(99,240,143,0.02)');
  g.fillStyle = gr; g.fill();
  g.fillStyle = col('--tenue'); g.textAlign = 'left'; g.font = '10px ui-monospace, Menlo, monospace';
  g.fillText('RTA · +3 dB/oct', L + 6, B - 8);
}
