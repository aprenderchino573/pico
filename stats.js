// PICO — métricas del historial. err = log2(centro / real), en octavas.
import { ZONAS, zonaDe, bitsDe } from './contenido.js';

const media = a => a.reduce((s, x) => s + x, 0) / a.length;
const mediana = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

export function metricas(ts) {
  if (!ts.length) return null;
  const e = ts.map(t => t.err), ab = e.map(Math.abs), b = media(e);
  const sd = e.length > 1 ? Math.sqrt(e.reduce((s, x) => s + (x - b) ** 2, 0) / (e.length - 1)) : 0;
  const pct = th => ab.filter(x => x <= th + 1e-9).length / ab.length;
  const aciertos = ts.filter(t => t.acierto);
  return {
    n: ts.length, mae: media(ab), mediana: mediana(ab), sesgo: b, sd,
    st1: pct(1 / 12), st2: pct(1 / 6), ter: pct(1 / 3), oct: pct(1),
    cobertura: aciertos.length / ts.length,
    anchura: media(ts.map(t => t.w)),
    bits: aciertos.length ? media(aciertos.map(t => bitsDe(Math.log2(t.lo), Math.log2(t.hi)))) : 0,
  };
}

export function porZona(ts) {
  return ZONAS.map(z => ({ zona: z, m: metricas(ts.filter(t => zonaDe(t.f).id === z.id)) }));
}

// Zona con mayor error medio (mínimo 5 pruebas). Por defecto, medios-graves.
export function zonaMasDebil(ts) {
  let peor = null;
  for (const { zona, m } of porZona(ts)) if (m && m.n >= 5 && (!peor || m.mae > peor.mae)) peor = { id: zona.id, mae: m.mae };
  return peor ? peor.id : 'mgrave';
}

const CAMPOS = ['t', 'modo', 'baraja', 'nivel', 'rejilla', 'ante', 'ciega', 'jefe', 'rango', 'fuente', 'cancion', 'gain', 'q', 'f', 'lo', 'hi', 'centro', 'err', 'w', 'acierto', 'bypass', 'presentacion', 'puntos'];
export function csv(ts) {
  const q = v => (v === null || v === undefined ? '' : typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : String(v));
  return [CAMPOS.join(','), ...ts.map(t => CAMPOS.map(c => q(t[c])).join(','))].join('\n');
}
