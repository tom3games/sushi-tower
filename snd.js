// 音のエンジン（素材なし・WebAudio）。曲・効果音・情けない声（母音のフォルマントで「お客様ーっ」）
// 使い方: 最初のタップで Snd.init()、画面切替で Snd.setTrack('名前')、ループで毎フレーム Snd.tick()、検証は Snd.played と Snd.level()
'use strict'
const Snd = {
  ctx: null, muted: false, next: 0, step: 0, track: null, want: null, switchAt: 0, played: {}, last: {},
  TEMPO: { title: 112, play: 148, result: 120, sad: 70 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    try {
      this.ctx = new AC()
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7
      this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048; this.master.connect(this.an); this.an.connect(this.ctx.destination)
      this.bgm = this.ctx.createGain(); this.bgm.gain.value = 0.0001; this.bgm.connect(this.master)
      const len = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, len, len)
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      if (this.want) { const w = this.want; this.want = null; this.setTrack(w) }
    } catch (e) { this.ctx = null }
  },
  setMute(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7 },
  tone(f, t0, dur, type = 'square', vol = 0.2, dest, f2) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g); g.connect(dest || this.master); o.start(t0); o.stop(t0 + dur + 0.02)
  },
  noise(t0, dur, vol, freq, type = 'highpass', dest, q) {
    if (!this.ctx) return; const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq; if (q) f.Q.value = q
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02)
  },
  now() { return this.ctx ? this.ctx.currentTime : 0 },
  level() { if (!this.an) return 0; const d = new Float32Array(this.an.fftSize); this.an.getFloatTimeDomainData(d); let m = 0; for (const v of d) m = Math.max(m, Math.abs(v)); return m },
  mtof: m => 440 * Math.pow(2, (m - 69) / 12),
  mark(n) { this.played[n] = (this.played[n] || 0) + 1 },
  setTrack(name) {
    if (this.want === name) return
    this.want = name; if (!this.ctx) return
    const now = this.ctx.currentTime, g = this.bgm.gain
    g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now); g.linearRampToValueAtTime(0.0001, now + 0.25)
    this.switchAt = now + 0.27
  },
  tick() {
    if (!this.ctx) return; const c = this.ctx
    if (this.switchAt && c.currentTime >= this.switchAt) {
      this.track = this.want; this.step = 0; this.next = c.currentTime + 0.05; this.switchAt = 0
      const g = this.bgm.gain; g.cancelScheduledValues(c.currentTime); g.setValueAtTime(0.0001, c.currentTime); g.linearRampToValueAtTime(0.24, c.currentTime + 0.35)
      if (this.track) this.mark('bgm:' + this.track)
    }
    if (!this.track || this.switchAt) return
    const spb = 60 / this.TEMPO[this.track] / 4
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05
    while (this.next < c.currentTime + 0.25) { this['p_' + this.track](this.step, this.next); this.next += spb; this.step++ }
  },
  // 和太鼓・拍子木・三味線っぽい撥弦
  taiko(t, v = 0.6) { this.tone(110, t, 0.28, 'sine', v, this.bgm, 55); this.noise(t, 0.08, v * 0.25, 300, 'lowpass', this.bgm) },
  kara(t, v = 0.12) { this.tone(1900, t, 0.04, 'square', v * 0.4, this.bgm); this.noise(t, 0.03, v, 2500, 'bandpass', this.bgm, 3) },
  hyoshi(t, v = 0.2) { this.tone(2300, t, 0.05, 'triangle', v, this.bgm); this.tone(3100, t, 0.03, 'sine', v * 0.5, this.bgm) },
  pluck(n, t, dur = 0.22, vol = 0.07) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain()
    o.type = 'sawtooth'; o.frequency.setValueAtTime(this.mtof(n) * 1.01, t); o.frequency.exponentialRampToValueAtTime(this.mtof(n), t + 0.03)
    f.type = 'lowpass'; f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(500, t + dur)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(f); f.connect(g); g.connect(this.bgm); o.start(t); o.stop(t + dur + 0.02)
  },
  flute(n, t, dur, vol = 0.05) { this.tone(this.mtof(n), t, dur, 'sine', vol, this.bgm); this.noise(t, dur * 0.6, vol * 0.25, this.mtof(n) * 2, 'bandpass', this.bgm, 8) },
  bass(n, t, dur = 0.18, vol = 0.36) { this.tone(this.mtof(n), t, dur, 'triangle', vol, this.bgm) },
  // タイトル: のんびりお囃子（ヨナ抜き）
  p_title(i, t) {
    const s = i % 16, bar = Math.floor(i / 16) % 4
    if (s === 0 || s === 10) this.taiko(t, 0.5); if (s === 6) this.taiko(t, 0.25); if (s % 4 === 2) this.kara(t, 0.08)
    const root = [50, 50, 55, 57][bar]
    if (s === 0 || s === 8) this.bass(root - 12, t, 0.3, 0.3)
    const mel = [[74, -1, 76, 79, 81, -1, 79, 76], [74, -1, 72, 69, 72, -1, -1, -1], [79, -1, 81, 84, 81, -1, 79, 76], [77, 76, 74, -1, 74, -1, -1, -1]][bar]
    if (s % 2 === 0) { const n = mel[s / 2]; if (n > 0) this.pluck(n, t, 0.3, 0.06) }
  },
  // プレイ: 速いお祭り
  p_play(i, t) {
    const s = i % 16, bar = Math.floor(i / 16) % 8
    if (s % 4 === 0) this.taiko(t, 0.55); if (s === 14) this.taiko(t, 0.3); if (s % 2 === 1) this.kara(t, 0.07); if (s === 4 || s === 12) this.hyoshi(t, 0.1)
    const root = [50, 50, 53, 55, 50, 50, 57, 55][bar]
    if (s % 4 === 0 || s === 6) this.bass(root - 12, t, 0.14, 0.32)
    const A = [[74, 76, 79, 76, 81, 79, 76, 74], [72, 74, 76, -1, 74, -1, 72, 69], [77, 79, 81, 79, 84, 81, 79, 77], [79, -1, 76, 74, 76, -1, -1, -1]]
    const n = A[bar % 4][s >> 1]; if (s % 2 === 0 && n > 0) this.pluck(n, t, 0.16, bar >= 4 ? 0.06 : 0.045)
    if (bar >= 4 && s === 0) this.flute(A[bar % 4][0] + 12, t, 0.5, 0.025)
  },
  // 結果: めでたい
  p_result(i, t) {
    const s = i % 16, bar = Math.floor(i / 16) % 4
    if (s === 0 || s === 8) this.taiko(t, 0.45); if (s % 4 === 2) this.kara(t, 0.06)
    const root = [55, 53, 50, 55][bar]; if (s === 0) this.bass(root - 12, t, 0.5, 0.3)
    const mel = [[79, 81, 84, 81], [77, 79, 81, 79], [74, 76, 79, 77], [79, -1, -1, -1]][bar]
    if (s % 4 === 0) { const n = mel[s / 4]; if (n > 0) this.flute(n, t, 0.42, 0.04) }
  },
  // 崩壊: しょんぼり
  p_sad(i, t) {
    const s = i % 12, bar = Math.floor(i / 12) % 4
    const mel = [[69, 67, 64], [65, 64, 62], [64, 62, 60], [57, -1, -1]][bar]
    if (s === 0) this.bass([45, 41, 40, 33][bar], t, 0.9, 0.24)
    if (s % 4 === 0) { const n = mel[s / 4]; if (n > 0) this.flute(n, t, 0.6, 0.05) }
  },
  // 母音のフォルマントで声を作る。seq = [[母音, 秒, 音程倍率, 子音]]
  voice(seq, base, vol = 0.22, rough = 0) {
    if (!this.ctx) return; const c = this.ctx, t0 = c.currentTime + 0.01
    const F = { a: [800, 1250], i: [320, 2300], u: [360, 1300], e: [520, 1850], o: [520, 880] }
    const o = c.createOscillator(); o.type = 'sawtooth'
    const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 7; vg.gain.value = base * 0.03; vib.connect(vg); vg.connect(o.frequency)
    const g = c.createGain(), f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), mix = c.createGain()
    f1.type = f2.type = 'bandpass'; f1.Q.value = 6; f2.Q.value = 8
    o.connect(f1); o.connect(f2); f1.connect(mix); f2.connect(mix); mix.connect(g); g.connect(this.master)
    let t = t0; g.gain.setValueAtTime(0.0001, t)
    for (const [v, d, pm, cons] of seq) {
      const fr = F[v]; f1.frequency.setValueAtTime(fr[0], t); f2.frequency.setValueAtTime(fr[1], t)
      o.frequency.setValueAtTime(base * pm, t); o.frequency.linearRampToValueAtTime(base * pm * (rough ? 0.94 : 1), t + d)
      if (cons === 'k') this.noise(t, 0.04, vol * 0.5, 2500, 'bandpass', null, 2)
      if (cons === 's') this.noise(t, 0.08, vol * 0.5, 5000, 'highpass')
      if (cons === 'h') this.noise(t, 0.1, vol * 0.4, 1800, 'bandpass', null, 1)
      g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.setValueAtTime(vol, t + d - 0.02)
      t += d
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
    o.start(t0); vib.start(t0); o.stop(t + 0.2); vib.stop(t + 0.2)
  },
  okyaku(high) {
    const b = high ? 330 : 190
    this.voice([['o', 0.1, 1], ['a', 0.09, 1.12, 'k'], ['u', 0.08, 1.2, 'k'], ['a', 0.09, 1.3, 's'], ['a', 0.08, 1.38], ['a', 0.75, 1.55], ['a', 0.25, 1.25]], b, high ? 0.2 : 0.26, 1)
  },
  // 効果音
  sfx(name, v = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime; this.mark(name)
    switch (name) {
      case 'tap': this.tone(880, t, 0.06, 'triangle', 0.12 * v); break
      case 'grab': this.noise(t, 0.12, 0.06, 1400, 'bandpass', null, 2); this.tone(500, t, 0.1, 'sine', 0.1, null, 900); break
      case 'chew': for (let k = 0; k < 3; k++) { this.noise(t + k * 0.1, 0.06, 0.12, 600, 'lowpass'); this.tone(170 + k * 8, t + k * 0.1, 0.05, 'sine', 0.12) } break
      case 'clink': { const f = 2200 + v * 90; this.tone(f, t, 0.35, 'sine', 0.13); this.tone(f * 2.76, t, 0.18, 'sine', 0.05); this.noise(t, 0.03, 0.08, 4000); break }
      case 'perfect': this.tone(2600, t, 0.5, 'sine', 0.14); this.tone(3900, t + 0.05, 0.4, 'sine', 0.07); this.tone(1318, t + 0.02, 0.3, 'triangle', 0.08); break
      case 'whiff': this.noise(t, 0.18, 0.05, 900, 'bandpass', null, 3); break
      case 'slip': this.tone(900, t, 0.3, 'triangle', 0.1, null, 300); break
      case 'smash': for (let k = 0; k < 7; k++) this.tone(1800 + Math.random() * 2800, t + Math.random() * 0.08, 0.15 + Math.random() * 0.2, 'sine', 0.07); this.noise(t, 0.3, 0.3, 2500); this.tone(160, t, 0.15, 'sine', 0.3, null, 60); break
      case 'crash':
        for (let k = 0; k < 60; k++) this.tone(1500 + Math.random() * 3500, t + Math.random() * 1.3, 0.12 + Math.random() * 0.3, 'sine', 0.06)
        for (let k = 0; k < 5; k++) this.noise(t + k * 0.22 + Math.random() * 0.1, 0.4, 0.35, 2000 + Math.random() * 2000)
        this.tone(90, t, 0.9, 'sine', 0.6, null, 30); break
      case 'wobble': this.tone(300, t, 0.4, 'triangle', 0.05, null, 260); this.tone(330, t + 0.2, 0.4, 'triangle', 0.05, null, 280); break
      case 'wasabi': this.tone(1200, t, 0.9, 'sine', 0.12, null, 3800); this.tone(1205, t, 0.9, 'sine', 0.08, null, 3810); this.noise(t, 0.6, 0.06, 6000); break
      case 'elbow': this.tone(110, t, 0.3, 'sine', 0.5, null, 50); this.noise(t, 0.15, 0.2, 500, 'lowpass'); break
      case 'boat': this.tone(150, t, 0.4, 'sine', 0.4, null, 70); this.noise(t, 0.2, 0.25, 900, 'lowpass'); break
      case 'warn': this.tone(1047, t, 0.08, 'square', 0.06); this.tone(1047, t + 0.12, 0.08, 'square', 0.06); break
      case 'bell': for (let k = 0; k < 3; k++) { this.tone(1568, t + k * 0.2, 0.5, 'sine', 0.15); this.tone(3136, t + k * 0.2, 0.3, 'sine', 0.05) } break
      case 'go': this.taikoFx(t); this.tone(784, t + 0.1, 0.25, 'triangle', 0.12); this.tone(1175, t + 0.22, 0.4, 'triangle', 0.12); break
      case 'print': this.noise(t, 0.05, 0.1, 3000, 'bandpass', null, 4); this.noise(t + 0.06, 0.05, 0.08, 2800, 'bandpass', null, 4); break
      case 'register': this.tone(2093, t, 0.6, 'sine', 0.14); this.tone(2637, t + 0.08, 0.6, 'sine', 0.12); this.noise(t, 0.1, 0.1, 3000); break
      case 'drum': for (let k = 0; k < 28; k++) this.noise(t + k * 0.04, 0.05, 0.04 + k * 0.004, 400, 'lowpass'); break
      case 'stamp': this.tone(140, t, 0.25, 'sine', 0.6, null, 50); this.noise(t, 0.12, 0.3, 700, 'lowpass'); break
      case 'cheer': this.noise(t, 2, 0.14, 1200, 'bandpass', null, 0.6); for (let k = 0; k < 50; k++) this.noise(t + Math.random() * 1.8, 0.03, 0.08, 1800 + Math.random() * 2000, 'bandpass', null, 0.8); break
      case 'ceiling': [72, 76, 79, 84].forEach((n, k) => this.tone(this.mtof(n), t + k * 0.12, 0.5, 'triangle', 0.14)); this.tone(this.mtof(88), t + 0.5, 0.9, 'sine', 0.1); break
      case 'boo': for (let k = 0; k < 6; k++) { const f = 120 + Math.random() * 40; this.tone(f, t + Math.random() * 0.2, 1.2, 'sawtooth', 0.03, null, f * 0.7) } break
      case 'eek': this.voice([['i', 0.12, 1.35, 'h'], ['i', 0.5, 1.2], ['i', 0.3, 0.9]], 520, 0.13, 1); break
      case 'ah': this.voice([['a', 0.22, 1.15], ['a', 0.18, 0.85]], 300, 0.13, 1); break
      case 'yum': this.voice([['u', 0.1, 1, 'h'], ['a', 0.18, 1.25], ['a', 0.1, 1.05]], 150, 0.18); break
      case 'okyaku': this.okyaku(false); setTimeout(() => this.okyaku(true), 380); break
    }
  },
  taikoFx(t) { this.tone(110, t, 0.35, 'sine', 0.6, null, 50); this.noise(t, 0.1, 0.2, 300, 'lowpass') },
}
window.Snd = Snd
