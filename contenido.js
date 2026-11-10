// PICO — contenido y reglas del juego (lógica pura, sin audio ni DOM)

export const F_MIN = 20, F_MAX = 20000;          // eje visible
export const LF_MIN = Math.log2(F_MIN), LF_MAX = Math.log2(F_MAX);
export const R_OCT = LF_MAX - LF_MIN;          // ≈ 9,97 octavas
export const GEN_MIN = 50, GEN_MAX = 15000;    // rango de juego: aquí se sortean los picos
export const LG_MIN = Math.log2(GEN_MIN), LG_MAX = Math.log2(GEN_MAX);
export const R_JUEGO = LG_MAX - LG_MIN;        // ≈ 8,23 octavas
// Bits = información respecto al rango de juego: solo cuenta la parte del intervalo dentro de 50 Hz–15 kHz.
export function bitsDe(a, b) {
  const util = Math.min(b, LG_MAX) - Math.max(a, LG_MIN);
  return Math.max(0, Math.log2(R_JUEGO / Math.max(util, W_MIN)));
}
export const W_MIN = 1 / 12;                   // anchura mínima del intervalo: 1 semitono

export const pick = a => a[Math.floor(Math.random() * a.length)];

// ---------- Zonas: nombre por su palabra definitoria ----------
export const ZONAS = [
  { id: 'sub',    nombre: 'Peso',      banda: 'Subgraves',     lo: 20,   hi: 80 },
  { id: 'grave',  nombre: 'Cuerpo',    banda: 'Graves',        lo: 80,   hi: 250 },
  { id: 'mgrave', nombre: 'Barro',     banda: 'Medios-graves', lo: 250,  hi: 800 },
  { id: 'medio',  nombre: 'Nasal',     banda: 'Medios',        lo: 800,  hi: 2500 },
  { id: 'pres',   nombre: 'Presencia', banda: 'Medios-agudos', lo: 2500, hi: 6000 },
  { id: 'aire',   nombre: 'Brillo',    banda: 'Agudos',        lo: 6000, hi: 20000 },
];
export const ZONA = Object.fromEntries(ZONAS.map(z => [z.id, z]));
export function zonaDe(f) { for (const z of ZONAS) if (f < z.hi) return z; return ZONAS[ZONAS.length - 1]; }
const k = f => (f >= 1000 ? (f / 1000).toString().replace('.', ',') + 'k' : String(f));
export const rangoZona = z => `${k(z.lo)}–${k(z.hi)} Hz`;

// ---------- Notas (notación científica: Do4 = 261,6 Hz, La4 = 440 Hz) ----------
const NOTAS = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
export function nota(f) {
  const m = 69 + 12 * Math.log2(f / 440), r = Math.round(m);
  return { nombre: NOTAS[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1), cents: Math.round((m - r) * 100) };
}
export function fmtNota(f) { const n = nota(f); return `${n.nombre} ${n.cents >= 0 ? '+' : '−'}${Math.abs(n.cents)}¢`; }
export function fmtHz(f) {
  if (f >= 10000) return (f / 1000).toFixed(1).replace('.', ',') + ' kHz';
  if (f >= 1000) return (f / 1000).toFixed(2).replace('.', ',') + ' kHz';
  return Math.round(f) + ' Hz';
}
export const num = (x, d = 2) => x.toFixed(d).replace('.', ',');

// ---------- Niveles de zona ----------
export const NIVEL_BASE = { c: 10, m: 2 };   // fichas por bit, mult
export const NIVEL_INC = { c: 5, m: 1 };
export function nivelesIniciales() {
  const n = {};
  for (const z of ZONAS) n[z.id] = { nivel: 1, c: NIVEL_BASE.c, m: NIVEL_BASE.m };
  return n;
}
export function subirNivel(run, zid) {
  const f = BARAJAS[run.baraja].factor(zid);
  const n = run.niveles[zid];
  n.nivel++; n.c += NIVEL_INC.c * f; n.m += NIVEL_INC.m * f;
}

// ---------- Barajas ----------
export const BARAJAS = {
  estudio: {
    id: 'estudio', nombre: 'Baraja de estudio',
    desc: 'Sin modificadores. La referencia para comparar.',
    factor: () => 1, manos: 4, descartes: 3,
  },
  barro: {
    id: 'barro', nombre: 'Baraja del Barro',
    desc: 'Las mejoras de Barro (250–800 Hz) rinden ×4; las de las demás zonas, ×0,5. Barro aparece más en la tienda.',
    factor: z => (z === 'mgrave' ? 4 : 0.5), sesgo: 'mgrave', manos: 4, descartes: 3,
  },
};

// ---------- Estructura de la partida ----------
export const N_ANTES = 5;
// Objetivo del jefe por ante; pequeña = ½, grande = ¾. Crece despacio al principio y se acelera (provisional).
const JEFE_OBJ = [300, 800, 2000, 4500, 9000];
export const OBJETIVOS = JEFE_OBJ.map(x => [Math.round(x * 0.5 / 10) * 10, Math.round(x * 0.75 / 10) * 10, x]);
export const RECOMPENSA = [3, 4, 5];
export const NOMBRE_CIEGA = ['Ciega pequeña', 'Ciega grande', 'Jefe'];
export const MANO_EXTRA_ANTE1 = 1;   // rampa de entrada
export const SLOTS_COMODIN = 5, SLOTS_CONSUMIBLE = 2, DINERO_INICIAL = 4;

// ---------- Escalera de 8 niveles por baraja ----------
// El estímulo es idéntico en todos (+12 dB, Q 2, log-uniforme 50 Hz–15 kHz); cambia la fuente y la rejilla de respuesta.
export const N_NIVELES = 8;
export const REJILLAS = ['zonas', 'octavas', 'tercios', 'libre'];
export const NOMBRE_REJILLA = { zonas: 'Zonas', octavas: 'Octavas', tercios: 'Tercios de octava', libre: 'Intervalo libre' };
export function nivelInfo(n) {
  const fuente = n <= 4 ? 'ruido' : 'cancion', rejilla = REJILLAS[(n - 1) % 4];
  return { n, fuente, rejilla, nombre: `${fuente === 'ruido' ? 'Ruido' : 'Canciones'} · ${NOMBRE_REJILLA[rejilla]}` };
}
// Ajuste de objetivos por nivel (provisional, a calibrar con tus datos)
const FACTOR_REJILLA = { zonas: 0.9, octavas: 1, tercios: 0.8, libre: 1 };
export function objetivo(nivel, ante, ciega) {
  const i = nivelInfo(nivel), f = FACTOR_REJILLA[i.rejilla] * (i.fuente === 'cancion' ? 0.8 : 1);
  return Math.max(50, Math.round(OBJETIVOS[ante - 1][ciega] * f / 10) * 10);
}

// Bandas de cada rejilla, en log2(Hz), recortadas al rango de juego
const ISO_TERCIOS = ['50', '63', '80', '100', '125', '160', '200', '250', '315', '400', '500', '630', '800', '1k', '1,25k', '1,6k', '2k', '2,5k', '3,15k', '4k', '5k', '6,3k', '8k', '10k', '12,5k', '16k'];
const ISO_OCTAVAS = ['63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
const hzNom = s => (s.endsWith('k') ? s.slice(0, -1) + ' kHz' : s + ' Hz');
const recorta = l => l.map(x => ({ ...x, a: Math.max(x.a, LG_MIN), b: Math.min(x.b, LG_MAX) })).filter(x => x.b - x.a > 1e-6);
export const BANDAS_REJILLA = {
  zonas: recorta(ZONAS.map(z => ({ a: Math.log2(z.lo), b: Math.log2(z.hi), nombre: z.nombre }))),
  octavas: recorta(ISO_OCTAVAS.map((nom, i) => { const c = Math.log2(1000) + (i - 4); return { a: c - 0.5, b: c + 0.5, nombre: hzNom(nom) }; })),
  tercios: recorta(ISO_TERCIOS.map((nom, i) => { const c = Math.log2(1000) + (i - 13) / 3; return { a: c - 1 / 6, b: c + 1 / 6, nombre: hzNom(nom) }; })),
};
export function bandaEn(rejilla, lf) {
  const l = BANDAS_REJILLA[rejilla];
  return l.find(x => lf >= x.a && lf < x.b) || (lf < l[0].a ? l[0] : l[l.length - 1]);
}

export const JEFES = [
  { id: 'susurro',   nombre: 'El Susurro',      desc: 'Picos de +6 dB en lugar de +12.',                       mod: { gain: 6 } },
  { id: 'campana',   nombre: 'La Campana',      desc: 'Q 1: picos el doble de anchos.',                       mod: { q: 1 } },
  { id: 'puente',    nombre: 'El Puente Roto',  desc: 'Sin bypass.',                                          mod: { noBypass: true } },
  { id: 'mesa',      nombre: 'La Mesa Pequeña', desc: 'Mano de 3 pistas.',                                    mod: { handSize: 3 } },
  { id: 'espejo',    nombre: 'El Espejo',       desc: 'La mitad de las pistas sale de tu zona más débil según tu historial.', mod: { debil: true } },
  { id: 'costumbre', nombre: 'La Costumbre',    desc: 'Sin A/B automático: el pico suena fijo, en bucle. El oído se adapta y la coloración se desvanece.', mod: { continuo: true } },
  { id: 'agujero',   nombre: 'El Agujero',      desc: 'Cortes de −12 dB en lugar de realces.',                mod: { gain: -12 }, minAnte: 3 },
];
export const JEFE = Object.fromEntries(JEFES.map(j => [j.id, j]));

export function paramsCiega(run, hayCanciones) {
  const p = { gain: 12, q: 2, handSize: 5, noBypass: false, debil: false, continuo: false, fuente: nivelInfo(run.nivel || 4).fuente };
  if (p.fuente === 'cancion' && !hayCanciones) p.fuente = 'ruido';
  if (run.ciega === 2) Object.assign(p, JEFE[run.jefe].mod);
  return p;
}

// ---------- Comodines ----------
// Regla de diseño: casi todos se activan por un acto de escucha (zona, acierto, anchura, racha, selección).
// tipo (color del arte): c fichas · m +mult · x ×mult · d dinero · u utilidad
export const RAREZAS = ['normal', 'especial', 'raro', 'legendario'];
export const PROB_RAREZA = { normal: 0.65, especial: 0.25, raro: 0.085, legendario: 0.015 };

class Ctx {
  constructor() { this.chips = 0; this.mult = 0; this.log = []; this.dinero = 0; this.factorChips = 1; this.veces = 1; }
  // Las fichas de los comodines van POR BIT: así un intervalo que no informa (0 bits) nunca puntúa.
  _l(e) { this.log.push({ ...e, c: this.chips, m: this.mult }); }
  addC(porBit, src) { const n = porBit * this.bits * this.factorChips; this.chips += n; this._l({ src, txt: `+${num(porBit, porBit % 1 ? 1 : 0)}/bit = +${Math.round(n)} fichas`, tipo: 'c' }); }
  addM(n, src) { this.mult += n; this._l({ src, txt: `+${num(n, n % 1 ? 1 : 0)} mult`, tipo: 'm' }); }
  xM(n, src) { this.mult *= n; this._l({ src, txt: `×${String(+n.toFixed(2)).replace('.', ',')} mult`, tipo: 'x' }); }
}
const enZona = (c, z) => c.hit && c.zona === z;

export const COMODINES = {
  // --- normales ---
  fader:      { nombre: 'Fader', rareza: 'normal', precio: 4, tipo: 'm', desc: '+4 mult al acertar.',
                score(c) { if (c.hit) c.addM(4, this.nombre); } },
  previo:     { nombre: 'Previo', rareza: 'normal', precio: 4, tipo: 'c', desc: '+4 fichas por bit al acertar.',
                score(c) { if (c.hit) c.addC(4, this.nombre); } },
  estrecho:   { nombre: 'Estrecho', rareza: 'normal', precio: 5, tipo: 'm', desc: '+8 mult si aciertas con ½ octava o menos.',
                score(c) { if (c.hit && c.w <= 0.5 + 1e-9) c.addM(8, this.nombre); } },
  purista:    { nombre: 'Purista', rareza: 'normal', precio: 5, tipo: 'm', desc: '+6 mult si aciertas sin haber usado el bypass en esa pista.',
                score(c) { if (c.hit && !c.pista.bypassUsado) c.addM(6, this.nombre); } },
  directo:    { nombre: 'Directo', rareza: 'normal', precio: 5, tipo: 'm', desc: '+2 mult por cada descarte que te quede.',
                score(c) { if (c.hit && c.run.descartes > 0) c.addM(2 * c.run.descartes, this.nombre); } },
  economo:    { nombre: 'Ecónomo', rareza: 'normal', precio: 4, tipo: 'd', desc: '+$1 por cada acierto.',
                score(c) { if (c.hit) { c.dinero += 1; c.log.push({ src: this.nombre, txt: '+$1', tipo: 'd' }); } } },
  centrado:   { nombre: 'Centrado', rareza: 'normal', precio: 5, tipo: 'c', desc: '+8 fichas por bit si el pico cae en el tercio central de tu respuesta.',
                score(c) { if (c.hit && Math.abs(Math.log2(c.f) - c.mid) <= c.w / 6) c.addC(8, this.nombre); } },
  acumulador: { nombre: 'Acumulador', rareza: 'normal', precio: 5, tipo: 'c', desc: 'Gana +0,5 fichas por bit por cada pista que descartes.',
                descDin: st => `Gana +0,5 fichas por bit por cada pista descartada. Ahora: +${num(st.c || 0, 1)}/bit.`,
                descarte(st, n) { st.c = (st.c || 0) + 0.5 * n; },
                score(c, st) { if (c.hit && st.c) c.addC(st.c, this.nombre); } },
  pareja:     { nombre: 'Pareja', rareza: 'normal', precio: 5, tipo: 'm', desc: '+12 mult si la mano anterior fue de la misma zona.',
                score(c) { if (c.hit && c.run.ultimaZona === c.zona) c.addM(12, this.nombre); } },
  monitor:    { nombre: 'Monitor', rareza: 'normal', precio: 4, tipo: 'u', desc: '+1 descarte en cada ronda.',
                ronda(r) { r.descartes += 1; } },
  patrocinador: { nombre: 'Patrocinador', rareza: 'normal', precio: 5, tipo: 'd', desc: '+$2 al superar cada ronda.',
                fin() { return 2; } },
  paleta:     { nombre: 'Paleta', rareza: 'normal', precio: 5, tipo: 'm', desc: '+2 mult por cada nivel de la zona del pico.',
                score(c) { if (c.hit) c.addM(2 * c.run.niveles[c.zona].nivel, this.nombre); } },
  // --- especiales ---
  racha:      { nombre: 'Racha', rareza: 'especial', precio: 6, tipo: 'm', desc: '+3 mult por cada acierto seguido (incluido este). Un fallo la reinicia.',
                descDin: st => `+3 mult por cada acierto seguido. Racha actual: ${st.n || 0}.`,
                score(c, st) { if (c.hit) { st.n = (st.n || 0) + 1; c.addM(3 * st.n, this.nombre); } else st.n = 0; } },
  analista:   { nombre: 'Analista', rareza: 'especial', precio: 6, tipo: 'm', desc: '+1 mult por cada nivel de zona por encima del 1 (sumando todas).',
                score(c) { if (!c.hit) return; const s = Object.values(c.run.niveles).reduce((a, n) => a + n.nivel - 1, 0); if (s) c.addM(s, this.nombre); } },
  ensayo:     { nombre: 'Ensayo', rareza: 'especial', precio: 7, tipo: 'u', desc: '+1 mano en cada ronda: más escuchas.',
                ronda(r) { r.manos += 1; } },
  grafico:    { nombre: 'Ecualizador gráfico', rareza: 'especial', precio: 6, tipo: 'm', desc: '+3 mult por cada zona distinta acertada en esta ronda (contando esta).',
                score(c) { if (c.hit) c.addM(3 * new Set([...(c.run.zonasRonda || []), c.zona]).size, this.nombre); } },
  barrido:    { nombre: 'Barrido', rareza: 'especial', precio: 6, tipo: 'c', desc: '+6 fichas por bit si aciertas en una zona distinta a la de la mano anterior.',
                score(c) { if (c.hit && c.run.ultimaZona && c.run.ultimaZona !== c.zona) c.addC(6, this.nombre); } },
  explorador: { nombre: 'Explorador', rareza: 'especial', precio: 6, tipo: 'm', desc: 'Gana +3 mult permanente la primera vez que aciertas en cada zona.',
                descDin: st => `Gana +3 mult la primera vez que aciertas en cada zona. Ahora: +${3 * (st.z || []).length} (${(st.z || []).length}/6).`,
                score(c, st) {
                  if (!c.hit) return; st.z ||= [];
                  if (!st.z.includes(c.zona)) st.z.push(c.zona);
                  c.addM(3 * st.z.length, this.nombre);
                } },
  compresor:  { nombre: 'Compresor', rareza: 'especial', precio: 7, tipo: 'x', desc: 'Gana ×0,1 mult por cada acierto de la partida.',
                descDin: st => `Gana ×0,1 mult por cada acierto. Ahora: ×${num(1 + 0.1 * (st.n || 0), 1)}.`,
                score(c, st) { if (c.hit) { st.n = (st.n || 0) + 1; c.xM(1 + 0.1 * st.n, this.nombre); } } },
  reverb:     { nombre: 'Reverb', rareza: 'especial', precio: 6, tipo: 'x', desc: '×2 mult en el acierto que sigue a un fallo.',
                score(c) { if (c.hit && c.run.ultimoFallo) c.xM(2, this.nombre); } },
  // --- raros ---
  bisturi:    { nombre: 'Bisturí', rareza: 'raro', precio: 8, tipo: 'x', desc: '×2 mult si aciertas con ⅓ de octava o menos.',
                score(c) { if (c.hit && c.w <= 1 / 3 + 1e-9) c.xM(2, this.nombre); } },
  red:        { nombre: 'Red de seguridad', rareza: 'raro', precio: 7, tipo: 'u', desc: 'Un fallo a menos de 2 semitonos del borde cuenta como acierto con la mitad de fichas.',
                pre(c) { if (!c.hit && c.dist <= 1 / 6) { c.hit = true; c.factorChips *= 0.5; c.log.push({ src: this.nombre, txt: 'salvado (½ fichas)', tipo: 'x' }); } } },
  croma:      { nombre: 'Croma', rareza: 'raro', precio: 8, tipo: 'x', desc: '×3 mult si el centro de tu respuesta tiene la misma nota que el pico (±50 cents, en cualquier octava).',
                score(c) {
                  if (!c.hit) return;
                  const d = (((1200 * Math.log2(c.centro / c.f)) % 1200) + 1200) % 1200;
                  if (Math.min(d, 1200 - d) <= 50) c.xM(3, this.nombre);
                } },
  veterano:   { nombre: 'Veterano', rareza: 'raro', precio: 8, tipo: 'x', desc: '×(1 + 0,5 por jefe vencido en esta partida) mult.',
                score(c) { if (c.hit && c.run.jefesVencidos) c.xM(1 + 0.5 * c.run.jefesVencidos, this.nombre); } },
  coro:       { nombre: 'Coro', rareza: 'raro', precio: 8, tipo: 'x', desc: '×1,5 mult si llevas 2 o más especialistas (de cualquier nivel).',
                score(c) { if (c.hit && c.run.comodines.filter(j => COMODINES[j.id].familia).length >= 2) c.xM(1.5, this.nombre); } },
  primera:    { nombre: 'Primera escucha', rareza: 'raro', precio: 8, tipo: 'x', desc: '×2 mult si respondes en menos de 10 s desde que empiezas a escuchar la pista.',
                score(c) { if (c.hit && c.tEscucha !== null && c.tEscucha <= 10) c.xM(2, this.nombre); } },
  sidechain:  { nombre: 'Sidechain', rareza: 'raro', precio: 9, tipo: 'u', copia: 'derecha', desc: 'Copia el efecto del comodín que tiene a su derecha.' },
  bus:        { nombre: 'Bus', rareza: 'raro', precio: 9, tipo: 'u', copia: 'primero', desc: 'Copia el efecto del primer comodín del rack.' },
  // --- legendarios ---
  masterizacion: { nombre: 'Masterización', rareza: 'legendario', precio: 12, tipo: 'x', desc: '×(1 + 0,5 por acierto en esta ronda, contando este) mult.',
                score(c) { if (c.hit) c.xM(1 + 0.5 * ((c.run.aciertosRonda || 0) + 1), this.nombre); } },
  fantasma:   { nombre: 'Fantasma', rareza: 'legendario', precio: 12, tipo: 'x', desc: 'Los aciertos en tu zona más débil (según tu historial) puntúan dos veces.',
                score(c) { if (c.hit && c.zona === c.run.zonaDebil) { c.veces *= 2; c.log.push({ src: this.nombre, txt: 'puntúa dos veces', tipo: 'x' }); } } },
};

// Especialistas: cuatro niveles por zona
export const FAMILIA = [
  { pre: 'esp', titulo: 'Especialista', rareza: 'normal', precio: 5, tipo: 'm' },
  { pre: 'exp', titulo: 'Experto', rareza: 'especial', precio: 7, tipo: 'm' },
  { pre: 'mae', titulo: 'Maestro', rareza: 'raro', precio: 9, tipo: 'x' },
  { pre: 'ley', titulo: 'Leyenda', rareza: 'legendario', precio: 14, tipo: 'x' },
];
for (const z of ZONAS) {
  const r = rangoZona(z), base = { zona: z.id, familia: true };
  COMODINES['esp_' + z.id] = { ...base, nivelFam: 1, nombre: `Especialista · ${z.nombre}`, rareza: 'normal', precio: 5, tipo: 'm',
    desc: `+10 mult si el pico estaba en ${z.nombre} (${r}).`,
    score(c) { if (enZona(c, z.id)) c.addM(10, this.nombre); } };
  COMODINES['exp_' + z.id] = { ...base, nivelFam: 2, nombre: `Experto · ${z.nombre}`, rareza: 'especial', precio: 7, tipo: 'm',
    desc: `Gana +2 mult permanente por cada acierto en ${z.nombre} (${r}).`,
    descDin: st => `Gana +2 mult por cada acierto en ${z.nombre} (${r}). Ahora: +${st.m || 0}.`,
    score(c, st) { if (enZona(c, z.id)) { st.m = (st.m || 0) + 2; c.addM(st.m, this.nombre); } } };
  COMODINES['mae_' + z.id] = { ...base, nivelFam: 3, nombre: `Maestro · ${z.nombre}`, rareza: 'raro', precio: 9, tipo: 'x',
    desc: `×2 mult si el pico estaba en ${z.nombre} (${r}).`,
    score(c) { if (enZona(c, z.id)) c.xM(2, this.nombre); } };
  COMODINES['ley_' + z.id] = { ...base, nivelFam: 4, nombre: `Leyenda · ${z.nombre}`, rareza: 'legendario', precio: 14, tipo: 'x',
    desc: `×(1 + 0,5 × nivel de ${z.nombre}) mult si el pico estaba en ${z.nombre} (${r}).`,
    score(c) { if (enZona(c, z.id)) c.xM(1 + 0.5 * c.run.niveles[z.id].nivel, this.nombre); } };
}
export const descComodin = j => { const d = COMODINES[j.id]; return d.descDin ? d.descDin(j.st) : d.desc; };

// Comodín cuyo efecto aplica j (los de copia apuntan a otro; no se encadenan)
export function efectivo(run, i) {
  const j = run.comodines[i], d = COMODINES[j.id];
  if (!d.copia) return { d, st: j.st };
  const t = d.copia === 'derecha' ? run.comodines[i + 1] : run.comodines[0];
  if (!t || t === j || COMODINES[t.id].copia) return null;
  j.st.copia ||= {};
  j.st.copia[t.id] ||= {};
  return { d: COMODINES[t.id], st: j.st.copia[t.id], via: d.nombre };
}
function cadaComodin(run, hook, ...args) {
  const out = [];
  run.comodines.forEach((_, i) => {
    const e = efectivo(run, i); if (!e || !e.d[hook]) return;
    const self = e.via ? { ...e.d, nombre: `${e.via} → ${e.d.nombre}` } : e.d;
    out.push(e.d[hook].call(self, ...args, e.st));
  });
  return out;
}
export function alEmpezarRonda(run) { cadaComodin(run, 'ronda', run); }
export function alDescartar(run, n) { run.comodines.forEach((_, i) => { const e = efectivo(run, i); e?.d.descarte?.(e.st, n); }); }
export function dineroFinRonda(run) { return cadaComodin(run, 'fin').reduce((a, b) => a + (b || 0), 0); }

export const CONSUMIBLES = {
  diapason: { nombre: 'Diapasón', desc: 'Suena un tono puro en el centro de tu intervalo actual, sobre la pista. Un uso.' },
  brujula:  { nombre: 'Brújula',  desc: 'Revela la zona de la pista seleccionada. Un uso.' },
};

// ---------- Puntuación ----------
// Puntos = fichas × mult. Fichas base = bits × (fichas/bit de la zona REAL del pico).
// bits = log2(rango total / anchura): el espectro entero vale 0, cada mitad de anchura +1 bit.
export function evaluar(pista, a, b) {
  const lf = Math.log2(pista.f), w = b - a, mid = (a + b) / 2, centro = 2 ** mid;
  const real = lf >= a && lf <= b;
  return {
    real, w, mid, centro, err: mid - lf,
    dist: real ? 0 : Math.min(Math.abs(lf - a), Math.abs(lf - b)),
    bits: bitsDe(a, b),
    zona: zonaDe(pista.f).id,
  };
}

export function puntuar(run, pista, a, b, tEscucha = null) {
  const ev = evaluar(pista, a, b);
  const c = new Ctx();
  Object.assign(c, { bits: ev.bits, hit: ev.real, w: ev.w, mid: ev.mid, centro: ev.centro, dist: ev.dist, zona: ev.zona, f: pista.f, pista, run, tEscucha });
  cadaComodin(run, 'pre', c);
  if (c.hit) {
    const nv = run.niveles[ev.zona], z = ZONA[ev.zona];
    c.chips = ev.bits * nv.c * c.factorChips;
    c.mult = nv.m;
    c.log.unshift({ c: c.chips, m: c.mult, src: `${z.nombre} nv ${nv.nivel}`, txt: `${num(ev.bits)} bits × ${num(nv.c, nv.c % 1 ? 1 : 0)} = ${Math.round(c.chips)} fichas · ${num(nv.m, nv.m % 1 ? 1 : 0)} mult`, tipo: 'base' });
  }
  cadaComodin(run, 'score', c);
  const total = c.hit ? Math.round(c.chips * c.mult * c.veces) : 0;
  return { ...ev, hit: c.hit, chips: c.chips, mult: c.mult, veces: c.veces, total, log: c.log, dinero: c.dinero };
}

// ---------- Tienda ----------
export function generarTienda(run) {
  const poseidos = new Set(run.comodines.map(j => j.id));
  // con bandas de anchura fija ≥ ½ octava, Estrecho y Bisturí no podrían activarse nunca
  const rej = nivelInfo(run.nivel || 4).rejilla;
  const inutiles = rej === 'zonas' || rej === 'octavas' ? ['estrecho', 'bisturi'] : [];
  const disp = Object.keys(COMODINES).filter(id => !poseidos.has(id) && !inutiles.includes(id));
  const comodines = [];
  for (let i = 0; i < 2 && disp.length; i++) {
    let u = Math.random(), rz = 'normal';
    for (const r of RAREZAS) { if (u < PROB_RAREZA[r]) { rz = r; break; } u -= PROB_RAREZA[r]; }
    let pool = disp.filter(id => COMODINES[id].rareza === rz);
    if (!pool.length) pool = disp.filter(id => COMODINES[id].rareza === 'normal');
    if (!pool.length) pool = disp;
    const id = pick(pool);
    disp.splice(disp.indexOf(id), 1);
    comodines.push({ id, precio: COMODINES[id].precio });
  }
  const items = [itemAleatorio(run), itemAleatorio(run)];
  return { comodines, items };
}
function itemAleatorio(run) {
  if (Math.random() < 0.7) {
    const b = BARAJAS[run.baraja];
    const z = b.sesgo && Math.random() < 0.5 ? b.sesgo : pick(ZONAS).id;
    return { tipo: 'planeta', zona: z, precio: 3 };
  }
  return Math.random() < 0.5 ? { tipo: 'diapason', precio: 3 } : { tipo: 'brujula', precio: 4 };
}
