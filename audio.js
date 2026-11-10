// PICO — audio: ruido rosa, filtro peaking (RBJ, igual que BiquadFilterNode),
// bypass con compensación de potencia y análisis espectral en tercios de octava.

export const BANDAS = Array.from({ length: 31 }, (_, i) => 1000 * 2 ** ((i - 17) / 3)); // ~20 Hz … ~20 kHz
export const bandaDe = f => Math.max(0, Math.min(30, Math.round(3 * Math.log2(f / 1000)) + 17));

// |H(f)| de un peaking RBJ (Audio EQ Cookbook), la misma definición de Q que usa Web Audio.
export function magH(f0, q, g, f, fs = 48000) {
  const A = 10 ** (g / 40), w0 = 2 * Math.PI * f0 / fs, al = Math.sin(w0) / (2 * q), cw = Math.cos(w0);
  const b0 = 1 + al * A, b1 = -2 * cw, b2 = 1 - al * A, a0 = 1 + al / A, a1 = -2 * cw, a2 = 1 - al / A;
  const w = 2 * Math.PI * f / fs, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2);
  const dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
  return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const p = i + k, q = p + h;
        const vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

const RMS_OBJ = 0.12; // −18 dBFS de nivel de trabajo para todo

export class Motor {
  constructor() {
    this.ctx = null; this.fuente = null; this.estado = { f: 1000, q: 2, gain: 12, comp: 1 }; this.bypassOn = false;
    this.fases = null; this.iFase = 0; this.timerAB = null; this.timerTope = null;
    this.onParada = null;          // aviso a la interfaz cuando se para sola
  }
  static FASE_AB = 1.2;            // s por fase en el A/B automático
  static TOPE = 15;                // s de escucha continua antes de parar sola

  async init() {
    // iOS: que el audio web suene aunque el interruptor de silencio esté activado (Safari 16.4+)
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
    // iOS < 16.4: un <audio> silencioso en bucle pone la sesión en modo reproducción y el audio web suena con el interruptor de silencio activado
    if (!navigator.audioSession && !this.silencio) {
      try {
        const s = this.silencio = document.createElement('audio');
        s.src = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
        s.loop = true; s.setAttribute('playsinline', ''); s.setAttribute('x-webkit-airplay', 'deny'); s.volume = 0.01;
        s.play().catch(() => {});
      } catch {}
    } else if (this.silencio && this.silencio.paused) { this.silencio.play().catch(() => {}); }
    if (this.ctx) { if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {}); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    this.filtro = ctx.createBiquadFilter(); this.filtro.type = 'peaking';
    this.comp = ctx.createGain();
    this.salida = ctx.createGain(); this.salida.gain.value = 0.7;
    this.analizador = ctx.createAnalyser(); this.analizador.fftSize = 16384; this.analizador.smoothingTimeConstant = 0.85;
    this.filtro.connect(this.comp).connect(this.salida).connect(this.analizador).connect(ctx.destination);
    this._td = new Float32Array(2048);
    this.rosa = this._rosa(12);
  }

  // Ruido rosa por el filtro de Paul Kellet (−3 dB/octava, error < 0,05 dB en banda audible)
  _rosa(seg) {
    const sr = this.ctx.sampleRate, n = Math.floor(seg * sr);
    const buf = this.ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
    }
    let s = 0; for (let i = 0; i < n; i++) s += d[i] * d[i];
    const k = RMS_OBJ / Math.sqrt(s / n); for (let i = 0; i < n; i++) d[i] *= k;
    return buf;
  }

  // Recorta un fragmento, le pone fundidos de 20 ms y lo normaliza a −18 dBFS RMS
  segmento(buf, start, dur) {
    const sr = buf.sampleRate, s0 = Math.floor(start * sr);
    const n = Math.max(1, Math.min(Math.floor(dur * sr), buf.length - s0));
    const ch = Math.min(2, buf.numberOfChannels), out = this.ctx.createBuffer(ch, n, sr);
    const fade = Math.min(Math.floor(0.02 * sr), n >> 1);
    let sum = 0, pico = 0;
    for (let c = 0; c < ch; c++) {
      const d = out.getChannelData(c);
      d.set(buf.getChannelData(c).subarray(s0, s0 + n));
      for (let i = 0; i < fade; i++) { const g = i / fade; d[i] *= g; d[n - 1 - i] *= g; }
      for (let i = 0; i < n; i++) { const v = d[i]; sum += v * v; if (Math.abs(v) > pico) pico = Math.abs(v); }
    }
    const rms = Math.sqrt(sum / (n * ch)) || 1e-9;
    const k = Math.min(RMS_OBJ / rms, 0.5 / (pico || 1e-9));
    for (let c = 0; c < ch; c++) { const d = out.getChannelData(c); for (let i = 0; i < n; i++) d[i] *= k; }
    return out;
  }

  // Potencia media por tercio de octava (FFT 8192 con ventana de Hann, tramas repartidas)
  espectro(buf, maxTramas = 40) {
    const N = 8192, sr = buf.sampleRate, ch = buf.numberOfChannels;
    const datos = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
    const pot = new Float64Array(N / 2);
    const nT = Math.max(1, Math.min(maxTramas, Math.floor(buf.length / N)));
    const paso = buf.length > N ? (buf.length - N) / Math.max(1, nT - 1) : 0;
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let t = 0; t < nT; t++) {
      const o = Math.floor(t * paso);
      for (let i = 0; i < N; i++) {
        let v = 0;
        for (let c = 0; c < ch; c++) v += datos[c][o + i] || 0;
        re[i] = (v / ch) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
        im[i] = 0;
      }
      fft(re, im);
      for (let i = 0; i < N / 2; i++) pot[i] += re[i] * re[i] + im[i] * im[i];
    }
    const hz = sr / N, P = new Float64Array(31);
    BANDAS.forEach((fc, kb) => {
      const i0 = Math.ceil(fc * 2 ** (-1 / 6) / hz), i1 = Math.floor(fc * 2 ** (1 / 6) / hz);
      if (i1 < i0) P[kb] = pot[Math.min(N / 2 - 1, Math.round(fc / hz))] || 0;
      else for (let i = i0; i <= Math.min(i1, N / 2 - 1); i++) P[kb] += pot[i];
    });
    return P;
  }

  // Planitud espectral 50 Hz–12 kHz: proxy de densidad de la mezcla (rareza)
  planitud(P) {
    const v = []; BANDAS.forEach((f, i) => { if (f >= 50 && f <= 12000) v.push(P[i] + 1e-20); });
    const geo = Math.exp(v.reduce((s, x) => s + Math.log(x), 0) / v.length);
    return geo / (v.reduce((s, x) => s + x, 0) / v.length);
  }

  // Ganancia que iguala la potencia con y sin pico, dada la potencia por bandas de la fuente
  compensacion(P, f, q, gain) {
    let num = 0, den = 0;
    BANDAS.forEach((fc, i) => { const m = magH(f, q, gain, fc, this.ctx.sampleRate); num += P[i] * m * m; den += P[i]; });
    return Math.min(2, Math.max(0.25, 1 / Math.sqrt(num / (den || 1))));
  }

  // Reproduce en bucle alternando "fases" cada FASE_AB s. Cada fase: { f, gain, comp, etq }.
  //  · normal con A/B: [plano, pico]  (empieza plano: el pico entra como un cambio)
  //  · continuo:       [pico]
  //  · comparador:     [tu respuesta, real]
  // silencio: segundos de pausa antes de sonar (al pasar de una pista a otra, para cortar la adaptación).
  reproducir(buf, { f, q, gain, comp }, { ab = true, silencio = 0, fases = null } = {}) {
    this.parar();
    const t = this.ctx.currentTime, t0 = t + silencio;
    this.estado = { f, q, gain, comp }; this.bypassOn = false;
    this.fases = fases || (ab ? [{ f, gain: 0, comp: 1, etq: null }, { f, gain, comp, etq: 'EQ IN' }] : [{ f, gain, comp, etq: 'EQ IN' }]);
    this.iFase = 0;
    this.filtro.Q.setValueAtTime(q, t);
    this._aplicar(this.fases[0], true);
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t0); env.gain.linearRampToValueAtTime(1, t0 + 0.03);
    s.connect(env).connect(this.filtro);
    s.start(t0);
    this.fuente = { s, env };
    if (this.fases.length > 1) {
      setTimeout(() => {
        if (this.fuente?.s !== s) return;
        this.timerAB = setInterval(() => {
          if (this.bypassOn) return;
          this.iFase = (this.iFase + 1) % this.fases.length;
          this._aplicar(this.fases[this.iFase]);
        }, Motor.FASE_AB * 1000);
      }, silencio * 1000);
    }
    this.timerTope = setTimeout(() => { if (this.fuente?.s === s) { this.parar(); this.onParada?.(); } }, (silencio + Motor.TOPE) * 1000);
  }

  // Etiqueta de lo que suena ahora (null = plano)
  get fase() { return !this.fuente ? null : this.bypassOn ? null : this.fases?.[this.iFase]?.etq ?? null; }
  get faseEQ() { return this.fase !== null; }

  _aplicar(fz, inmediato = false) {
    const t = this.ctx.currentTime;
    const pares = [[this.filtro.gain, fz.gain], [this.comp.gain, fz.comp], [this.filtro.frequency, fz.f]];
    for (const [p, v] of pares) {
      p.cancelScheduledValues(t);
      if (inmediato) p.setValueAtTime(v, t); else p.setTargetAtTime(v, t, 0.008);
    }
  }

  parar() {
    clearInterval(this.timerAB); clearTimeout(this.timerTope); this.timerAB = this.timerTope = null;
    if (!this.fuente) return;
    const { s, env } = this.fuente, t = this.ctx.currentTime;
    env.gain.cancelScheduledValues(t); env.gain.setValueAtTime(env.gain.value, t); env.gain.linearRampToValueAtTime(0, t + 0.03);
    s.stop(t + 0.05);
    this.fuente = null;
  }

  get sonando() { return !!this.fuente; }

  // Bypass manual: mientras se mantiene, plano; al soltar, vuelve al pico (y el A/B sigue desde ahí).
  setBypass(on) {
    this.bypassOn = on;
    if (!this.ctx || !this.fuente) return;
    let fz = this.fases[this.iFase];
    if (on) return this._aplicar({ f: fz.f, gain: 0, comp: 1 });
    if (fz.gain === 0) { const k = this.fases.findIndex(x => x.gain !== 0); if (k >= 0) { this.iFase = k; fz = this.fases[k]; } }
    this._aplicar(fz);
  }

  tono(f, dur = 2) {
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.05);
    g.gain.setValueAtTime(0.06, t + dur - 0.1); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.salida); o.start(t); o.stop(t + dur + 0.05);
  }

  nivel() {
    if (!this.ctx) return 0;
    this.analizador.getFloatTimeDomainData(this._td);
    let s = 0; for (const v of this._td) s += v * v;
    return Math.sqrt(s / this._td.length);
  }
}
