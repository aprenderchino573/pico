// PICO — iconos SVG propios (24×24, trazo con currentColor)

const P = {
  // comodines
  fader: '<rect x="10.5" y="3" width="3" height="18" rx="1.5"/><rect x="6" y="11" width="12" height="5" rx="1" fill="currentColor" fill-opacity=".35"/><path d="M8 13.5h8"/>',
  previo: '<circle cx="12" cy="12" r="7.5"/><path d="M12 12 16.5 7.5"/><path d="M4.5 19l1.5-1.5M19.5 19 18 17.5M12 2.5v1.5"/>',
  estrecho: '<path d="M4 6l5 6-5 6M20 6l-5 6 5 6"/><path d="M11 12h2"/>',
  bisturi: '<path d="M3 21 15 9"/><path d="M15 9c2-3 4.5-5 6-6-1 1.5-3 4-6 6Z" fill="currentColor" fill-opacity=".35"/><path d="M6 18l2 2"/>',
  purista: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l3 3 5-6"/>',
  directo: '<path d="M13 2 5 13.5h6L10 22l9-12h-6l1-8Z" fill="currentColor" fill-opacity=".25"/>',
  economo: '<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9c-.5-1-1.6-1.6-2.8-1.6-1.6 0-2.8.9-2.8 2.1 0 2.9 5.8 1.6 5.8 4.6 0 1.2-1.3 2.2-3 2.2-1.3 0-2.5-.6-3-1.6M12 6v1.4M12 16.6V18"/>',
  centrado: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  acumulador: '<rect x="5" y="16" width="14" height="3.5" rx="1"/><rect x="5" y="11" width="14" height="3.5" rx="1"/><rect x="5" y="6" width="14" height="3.5" rx="1" fill="currentColor" fill-opacity=".3"/><path d="M12 1.5v3"/>',
  pareja: '<rect x="3.5" y="5" width="10" height="14" rx="1.5"/><rect x="10.5" y="5" width="10" height="14" rx="1.5" fill="currentColor" fill-opacity=".2"/>',
  monitor: '<path d="M3 18 7 7h10l4 11Z"/><circle cx="12" cy="13" r="3"/>',
  patrocinador: '<rect x="2.5" y="6.5" width="19" height="11" rx="1.5"/><circle cx="12" cy="12" r="2.6"/><path d="M5.5 9.5v5M18.5 9.5v5"/>',
  paleta: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.6-2.2-.5-1.5.4-2.8 2-2.8H18a3 3 0 0 0 3-3c0-5.5-4-10-9-10Z"/><circle cx="7.5" cy="11" r="1.3" fill="currentColor"/><circle cx="10.5" cy="7" r="1.3" fill="currentColor"/><circle cx="15" cy="7.5" r="1.3" fill="currentColor"/>',
  racha: '<path d="M12 22c4 0 7-2.8 7-6.8 0-3.6-2.6-5.6-3.6-8.7-.6 1.8-1.6 2.8-2.6 3.2C13 6.4 11.4 3.6 9 2c.3 3.6-4 6.4-4 11.8C5 18.6 8 22 12 22Z" fill="currentColor" fill-opacity=".25"/><path d="M12 22c-1.8 0-3-1.2-3-3 0-2.2 2.4-3.2 3-5.4.8 2 3 3 3 5.4 0 1.8-1.2 3-3 3Z"/>',
  analista: '<path d="M3 21h18"/><rect x="5" y="12" width="3" height="7"/><rect x="10.5" y="7" width="3" height="12" fill="currentColor" fill-opacity=".3"/><rect x="16" y="3.5" width="3" height="15.5"/>',
  ensayo: '<path d="M8 21 10.5 3h3L16 21Z"/><path d="M6.5 21h11M12 15 17 6"/><circle cx="17" cy="6" r="1.4" fill="currentColor"/>',
  grafico: '<path d="M4 3v18M9 3v18M14 3v18M19 3v18"/><rect x="2.5" y="13" width="3" height="2.4" fill="currentColor"/><rect x="7.5" y="7" width="3" height="2.4" fill="currentColor"/><rect x="12.5" y="10" width="3" height="2.4" fill="currentColor"/><rect x="17.5" y="15" width="3" height="2.4" fill="currentColor"/>',
  barrido: '<path d="M3 17c4-9 10-11 16-9"/><path d="M15.5 4.5 19.5 8l-4 3"/><path d="M3 21h18" stroke-opacity=".4"/>',
  explorador: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5Z" fill="currentColor" fill-opacity=".35"/>',
  compresor: '<path d="M3 21 12 12"/><path d="M12 12c2-1.6 5-2.6 9-3"/><path d="M3 3v18h18" stroke-opacity=".4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  reverb: '<path d="M3 12h2M7 7v10M11 9v6M15 10.5v3M19 11.3v1.4"/>',
  red: '<path d="M3 5c3 2 15 2 18 0M3 5v14c3-2 15-2 18 0V5"/><path d="M7.5 5.8v12.4M12 6v12M16.5 5.8v12.4M3 9.6c3 1.2 15 1.2 18 0M3 14.3c3 1.2 15 1.2 18 0"/>',
  croma: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6" fill="currentColor" fill-opacity=".35"/><circle cx="17.5" cy="16" r="2.6" fill="currentColor" fill-opacity=".35"/>',
  veterano: '<path d="M8 2h8l-2 7h-4Z"/><circle cx="12" cy="15" r="6"/><path d="m12 11.8 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3Z" fill="currentColor"/>',
  coro: '<circle cx="6" cy="9" r="2.5"/><circle cx="12" cy="7" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M2.5 19c.5-3 2-5 3.5-5s3 2 3.5 5M8.5 17c.5-3 2-5 3.5-5s3 2 3.5 5M14.5 19c.5-3 2-5 3.5-5s3 2 3.5 5"/>',
  primera: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9M9.5 2.5h5M12 2.5V6M18.5 6.5l1.5-1.5"/>',
  sidechain: '<rect x="2.5" y="8" width="7" height="8" rx="1"/><rect x="14.5" y="8" width="7" height="8" rx="1" fill="currentColor" fill-opacity=".3"/><path d="M9.5 12h5M12.5 10l2 2-2 2"/>',
  bus: '<path d="M3 5h5c3 0 4 7 7 7h6M3 19h5c3 0 4-7 7-7"/><path d="M3 12h18" stroke-opacity=".5"/>',
  masterizacion: '<path d="M3 18 4.5 7l4.5 4.5L12 4l3 7.5L19.5 7 21 18Z" fill="currentColor" fill-opacity=".3"/><path d="M3 21h18"/>',
  fantasma: '<path d="M5 21V11a7 7 0 0 1 14 0v10l-2.3-1.8L14.3 21 12 19.2 9.7 21l-2.4-1.8Z" fill="currentColor" fill-opacity=".2"/><circle cx="9.5" cy="11" r="1.2" fill="currentColor"/><circle cx="14.5" cy="11" r="1.2" fill="currentColor"/>',
  // zonas
  z_sub: '<path d="M2 12c2.5-7 7.5-7 10 0s7.5 7 10 0"/><path d="M2 20h20" stroke-opacity=".4"/>',
  z_grave: '<path d="M2 12c1.7-5 3.3-5 5 0s3.3 5 5 0 3.3-5 5 0 3.3 5 5 0"/>',
  z_mgrave: '<path d="M12 3c3 4.5 5 7.3 5 10a5 5 0 0 1-10 0c0-2.7 2-5.5 5-10Z" fill="currentColor" fill-opacity=".3"/><path d="M5 21c2-1 4 1 7 0s5-1 7 0"/>',
  z_medio: '<path d="M3 9h4l8-5v16l-8-5H3Z" fill="currentColor" fill-opacity=".2"/><path d="M18 9c1 1.8 1 4.2 0 6"/>',
  z_pres: '<path d="M4 6l6 6-6 6M12 6l6 6-6 6"/>',
  z_aire: '<path d="M12 2c.8 5 2 7.2 7 8-5 .8-6.2 3-7 8-.8-5-2-7.2-7-8 5-.8 6.2-3 7-8Z" fill="currentColor" fill-opacity=".3"/><path d="M19 15c.3 2 .8 2.7 2.5 3-1.7.3-2.2 1-2.5 3-.3-2-.8-2.7-2.5-3 1.7-.3 2.2-1 2.5-3Z"/>',
  // consumibles
  diapason: '<path d="M9 2v8a3 3 0 0 0 6 0V2"/><path d="M12 13v9"/>',
  brujula: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8Z" fill="currentColor" fill-opacity=".4"/>',
  // jefes
  j_susurro: '<path d="M3 12c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0" stroke-opacity=".6"/>',
  j_campana: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4Z" fill="currentColor" fill-opacity=".2"/><path d="M10 21h4"/>',
  j_puente: '<path d="M2 15h7M15 15h7M9 15l1.5 3M15 15l-1.5 3"/><path d="M4 15V9M20 15V9M4 9c2.5 2 5 3 5 3M20 9c-2.5 2-5 3-5 3"/>',
  j_mesa: '<path d="M6 3v18M12 3v18M18 3v18"/><rect x="4" y="12" width="4" height="3" fill="currentColor"/><rect x="10" y="7" width="4" height="3" fill="currentColor"/><rect x="16" y="14" width="4" height="3" fill="currentColor"/>',
  j_espejo: '<ellipse cx="12" cy="10" rx="6" ry="8"/><path d="M12 18v4M8 22h8M9 7l3-3M9.5 11l5-5"/>',
  j_costumbre: '<path d="M17 4l3 3-3 3"/><path d="M20 7H8a5 5 0 0 0 0 10h1"/><path d="M7 20l-3-3 3-3"/><path d="M4 17h12a5 5 0 0 0 0-10h-1"/>',
  j_agujero: '<path d="M2 7h7c1.5 0 2 10 3 10s1.5-10 3-10h7"/>',
  // barajas y otros
  b_estudio: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="2.5" y="14" width="4" height="7" rx="1.5" fill="currentColor" fill-opacity=".3"/><rect x="17.5" y="14" width="4" height="7" rx="1.5" fill="currentColor" fill-opacity=".3"/>',
  b_barro: '<path d="M12 3c3 4.5 5 7.3 5 10a5 5 0 0 1-10 0c0-2.7 2-5.5 5-10Z" fill="currentColor" fill-opacity=".3"/><path d="M5 21c2-1 4 1 7 0s5-1 7 0"/>',
  ruido: '<path d="M2 12h1.5l1-4 1.5 9 1.5-12 1.5 10 1.5-6 1.5 8 1.5-11 1.5 9 1.5-5 1.5 4 1-2H22"/>',
  cancion: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="17.5" cy="16" r="2.6"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  ciega: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5" fill="currentColor" fill-opacity=".3"/>',
};

export const ZONA_ICONO = { sub: 'z_sub', grave: 'z_grave', mgrave: 'z_mgrave', medio: 'z_medio', pres: 'z_pres', aire: 'z_aire' };

export function icono(key, cls = '') {
  const p = P[key] || P.ciega;
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

// Icono de un comodín (los especialistas usan el de su zona con marcas de nivel)
export function iconoComodin(id, d) {
  if (d.familia) return icono(ZONA_ICONO[d.zona]);
  return icono(id);
}

// Colores: zonas, tipo de efecto y rareza
export const ZONA_COLOR = { sub: '#7a63e0', grave: '#3f86e0', mgrave: '#a87a3c', medio: '#d9a43a', pres: '#e86a3f', aire: '#6fd8ee' };
export const TIPO_COLOR = { c: '#2f74d9', m: '#d6493a', x: '#8b4fd8', d: '#2f9a5a', u: '#5b6a7c' };
export const NOMBRE_TIPO = { c: 'fichas', m: '+mult', x: '×mult', d: 'dinero', u: 'utilidad' };
