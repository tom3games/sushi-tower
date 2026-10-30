// 回転寿司の皿タワー / SUSHI PLATE TOWER
// 3D の回転寿司店。レーンの皿をタイミングよく取って食べ、目の前に積む。時間は固定60Hz（performance.now で数える）
import * as THREE from './vendor/three.module.js'
if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath() }

const D = window.ST_DATA
const $ = s => document.querySelector(s)
const DT = 1 / 60
const clamp = (v, a, b) => v < a ? a : v > b ? b : v
const lerp = (a, b, k) => a + (b - a) * k
const ease = k => k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k)
const isTouch = matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0)
const store = { get(k, d) { try { const v = localStorage.getItem('st.' + k); return v == null ? d : v } catch (e) { return d } }, set(k, v) { try { localStorage.setItem('st.' + k, v) } catch (e) {} } }
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const TUNE = { swayK: 0.0036 }
const PT = Object.fromEntries(D.PLATES.map(p => [p.id, p]))

// ---------- 寸法（世界の単位）
const COUNTER_Y = 1.0, LANE_Y = 1.12, LANE_Z = 0, TOWER_X = 0.55, TOWER_Z = -1.0, TH = 0.12
const CEIL_Y = COUNTER_Y + D.CEIL * TH + 0.03, BOAT_Y = 2.62, REACH = 0.95
const ME = { x: -0.62, z: -2.05 }, NB = { x: -2.65, z: -2.05 }, CHEF0 = { x: -4.3, z: 1.0 }

// ---------- 状態
const S = {
  lang: store.get('lang', (navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en'),
  muted: store.get('mute', '0') === '1', best: Number(store.get('best', '0')) || 0, tutSeen: store.get('tut', '0') === '1',
  view: 'title', phase: 'ready', t: 0, phT: 0, simT: 0, rng: Math.random, seed: 1, dbgPause: false, fast: false, bot: null,
  lane: [], nextSpawn: 0, tower: [], baseX: TOWER_X, sway: { ph: 0, q: 0, qv: 0, A: 0 }, badT: 0, margin: 1,
  busy: 0, eat: null, tears: 0, combo: 0, eaten: {}, slips: 0, perfects: 0, events: [], warn: null, said: {},
  debris: [], shards: [], result: null, shake: 0, lastWobble: 0, collapsed: false, ceil: false,
}
const T = k => D.TXT[S.lang][k] ?? k

// ---------- 描画の土台
const canvas = $('#gl')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.5 : 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x2a1712)
scene.fog = new THREE.Fog(0x2a1712, 16, 34)
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 80)
const hemi = new THREE.HemisphereLight(0xfff1dc, 0x5a3a28, 1.9); scene.add(hemi)
const sun = new THREE.DirectionalLight(0xffe6c0, 1.5); sun.position.set(3, 8, 7); scene.add(sun)
const fill = new THREE.DirectionalLight(0xc8d8ff, 0.45); fill.position.set(-6, 3, 4); scene.add(fill)
const under = new THREE.DirectionalLight(0xffd9a0, 0.5); under.position.set(0, -4, 3); scene.add(under)

function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]) }
  t.anisotropy = 4; return t
}
const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o })
const box = (w, h, d, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m }
const JFONT = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif'
const GFONT = '"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif'
const srng = mulberry(11)

// ---------- 店
;(() => {
  // 床
  const floorT = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#6e4a32'; x.fillRect(0, 0, w, h)
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#7a5338' : '#68452e'; x.fillRect(0, i * 32, w, 31); x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, i * 32 + 31, w, 1) }
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(0,0,0,${srng() * 0.08})`; x.fillRect(srng() * w, srng() * h, 20 + srng() * 40, 1) }
  }, [6, 6])
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), lam(0xffffff, { map: floorT })); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0, -2); scene.add(fl)
  // 奥の壁（しっくい＋柱＋腰板）
  const wallT = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#efe2c6'; x.fillRect(0, 0, w, h)
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(120,90,50,${srng() * 0.06})`; x.fillRect(srng() * w, srng() * h, 2, 2) }
    x.fillStyle = '#5a3a24'; x.fillRect(0, h * 0.72, w, h * 0.28); x.fillStyle = '#4a2e1c'; for (let i = 0; i < w; i += 32) x.fillRect(i, h * 0.72, 3, h * 0.28)
    x.fillStyle = '#3e2616'; x.fillRect(0, h * 0.7, w, 8); x.fillRect(0, 0, 18, h); x.fillRect(w - 18, 0, 18, h)
  }, [3, 1])
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(26, 7), lam(0xffffff, { map: wallT })); wall.position.set(0, 3.5, -3.6); scene.add(wall)
  // お品書きの木札
  const menu = [['まぐろ', '280'], ['サーモン', '180'], ['大トロ', '480'], ['うに', '880'], ['たまご', '120'], ['えび', '180'], ['いくら', '880'], ['はまち', '280'], ['かっぱ', '120'], ['えんがわ', '280'], ['中トロ', '480'], ['あなご', '280']]
  const tagT = canvasTex(1024, 160, (x, w, h) => {
    x.clearRect(0, 0, w, h); const n = menu.length, tw = w / n
    menu.forEach(([nm, pr], i) => {
      const X = i * tw + 4; x.fillStyle = i % 4 === 2 ? '#f6e7c4' : '#e9d3a5'; x.fillRect(X, 6, tw - 8, h - 12)
      x.strokeStyle = '#8a6a3a'; x.lineWidth = 3; x.strokeRect(X + 2, 8, tw - 12, h - 16)
      x.fillStyle = '#2a1712'; x.textAlign = 'center'; const ch = [...nm], fs = Math.min(26, 112 / ch.length)
      x.font = `900 ${fs}px ${JFONT}`; ch.forEach((c, k) => x.fillText(c, X + tw / 2 - 4, 34 + k * fs))
      x.fillStyle = '#c0392b'; x.font = `900 20px ${GFONT}`; x.fillText(pr, X + tw / 2 - 4, h - 16)
    })
  })
  tagT.anisotropy = 8
  const tags = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.9), new THREE.MeshLambertMaterial({ map: tagT, transparent: true })); tags.position.set(-0.6, 3.9, -3.58); scene.add(tags)
  // 天井の梁（ここにタワーが届くと天井到達）
  const beamM = lam(0x7a4e2e, { emissive: 0x2a160a })
  box(26, 0.34, 0.5, beamM, 0, CEIL_Y + 0.17, TOWER_Z)
  const ceilT = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#b98a5a'; x.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { x.strokeStyle = `rgba(110,70,40,${0.1 + srng() * 0.15})`; x.beginPath(); const y = srng() * h; x.moveTo(0, y); x.lineTo(w, y + 4); x.stroke() } x.fillStyle = '#5a3a22'; x.fillRect(0, 0, w, 14); x.fillRect(0, 0, 14, h) }, [10, 4])
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(26, 10), lam(0xffffff, { map: ceilT, emissive: 0x3a2412 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, CEIL_Y + 0.34, -1); scene.add(ceil)
  // 提灯
  const lanT = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#d8392f'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < h; i += 12) x.fillRect(0, i, w, 2)
    x.fillStyle = '#1a0d08'; x.fillRect(0, 0, w, 14); x.fillRect(0, h - 14, w, 14)
    x.fillStyle = '#fff'; x.font = `900 52px ${JFONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('寿', w / 2, h / 2 + 2)
  })
  const lanM = new THREE.MeshLambertMaterial({ map: lanT, emissive: 0xff5a3a, emissiveIntensity: 0.55 })
  const lanG = new THREE.SphereGeometry(0.32, 14, 10); lanG.scale(1, 1.25, 1)
  for (const [x, z] of [[-4.2, -2.7], [3.6, -2.7], [-1.6, 0.9], [2.4, 0.9], [-1.9, -3.0], [1.9, -3.0], [0.0, -3.1]]) {
    const l = new THREE.Mesh(lanG, lanM); l.position.set(x, CEIL_Y - 0.55, z); scene.add(l)
    box(0.02, 0.4, 0.02, beamM, x, CEIL_Y - 0.1, z)
  }
  // のれん（右の入口）
  const norenT = canvasTex(256, 192, (x, w, h) => {
    x.fillStyle = '#26365e'; x.fillRect(0, 0, w, h); x.fillStyle = '#fbf7ee'; x.font = `900 92px ${JFONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'
    x.fillText('す', w * 0.25, h * 0.52); x.fillText('し', w * 0.75, h * 0.52); x.fillStyle = '#1b2746'; x.fillRect(0, 0, w, 16)
  })
  const nor = new THREE.Group(); nor.position.set(5.6, 3.25, -3.5); scene.add(nor)
  for (let i = 0; i < 2; i++) {
    const t = norenT.clone(); t.needsUpdate = true; t.repeat.set(0.5, 1); t.offset.set(i * 0.5, 0)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.7), lam(0xffffff, { map: t, side: THREE.DoubleSide })); m.position.set(-0.6 + i * 1.2, 0, 0.02); nor.add(m)
  }
  box(2.8, 0.08, 0.08, lam(0x8a6a3a), 5.6, 4.12, -3.45)
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.6), lam(0x1a1210)); door.position.set(5.6, 1.8, -3.58); scene.add(door)
  // 客側カウンター（ひのき）
  const hinT = canvasTex(256, 64, (x, w, h) => { x.fillStyle = '#e6c590'; x.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(150,100,50,${0.08 + srng() * 0.1})`; x.lineWidth = 1; x.beginPath(); const y = srng() * h; x.moveTo(0, y); x.bezierCurveTo(w * 0.3, y + 6 * (srng() - .5), w * 0.6, y - 6 * (srng() - .5), w, y + 3); x.stroke() } }, [6, 1])
  const hin = lam(0xffffff, { map: hinT })
  box(26, 0.1, 1.25, hin, 0, COUNTER_Y - 0.05, -1.08)
  box(26, COUNTER_Y - 0.1, 0.1, lam(0x5a3a24), 0, (COUNTER_Y - 0.1) / 2, -1.68)
  // レーン（ベルト＋ステンレスの縁）
  const beltT = canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#7d848c'; x.fillRect(0, 0, w, h); x.fillStyle = '#5c636b'; x.fillRect(0, 0, 3, h); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(4, 0, 2, h) }, [40, 1])
  S.beltT = beltT
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(26, 0.96), lam(0xffffff, { map: beltT })); belt.rotation.x = -Math.PI / 2; belt.position.set(0, LANE_Y, LANE_Z); scene.add(belt)
  const steel = new THREE.MeshPhongMaterial({ color: 0xc9d0d6, shininess: 80, specular: 0x777777 })
  box(26, 0.09, 0.06, steel, 0, LANE_Y + 0.02, LANE_Z - 0.51); box(26, 0.09, 0.06, steel, 0, LANE_Y + 0.02, LANE_Z + 0.51)
  box(26, LANE_Y - 0.05, 1.1, lam(0x9aa1a8), 0, (LANE_Y - 0.05) / 2, LANE_Z)
  // 板前側の作業台
  box(26, 0.92, 1.4, lam(0xd8dde2), 0, 0.46, 1.35)
  box(26, 0.06, 1.42, steel, 0, 0.93, 1.35)
  // 鮮魚ケース（板前側）
  const caseM = new THREE.MeshPhongMaterial({ color: 0xcfe8f5, transparent: true, opacity: 0.35, shininess: 100 })
  box(3.2, 0.5, 0.7, caseM, 1.6, 1.21, 1.3)
  for (let i = 0; i < 6; i++) box(0.4, 0.08, 0.25, lam([0xd83a34, 0xff8a5c, 0xf28aa0, 0xd83a34, 0xf6d36b, 0xff8a5c][i]), 0.4 + i * 0.48, 1.0, 1.3)
  // 椅子
  const stoolM = lam(0x8f1d1a), legM = lam(0x2a2a2a)
  for (const x of [-4.65, NB.x, ME.x, 1.75, 3.75]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 16), stoolM); s.position.set(x, 0.86, -2.15); scene.add(s); box(0.08, 0.8, 0.08, legM, x, 0.4, -2.15) }
  // 湯のみ・給湯・ガリ・醤油（自分の席）
  const yunT = canvasTex(256, 64, (x, w, h) => { x.fillStyle = '#e9e2d0'; x.fillRect(0, 0, w, h); x.fillStyle = '#2b3d6b'; x.font = `900 22px ${JFONT}`; const fish = '鮪鯛鮭鰤鯵鰯鰻鮎鯖鰹'; for (let i = 0; i < 10; i++) x.fillText(fish[i], 6 + i * 25, 22 + (i % 2) * 26) })
  const yun = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.3, 16), lam(0xffffff, { map: yunT })); yun.position.set(-0.95, COUNTER_Y + 0.15, -1.15); scene.add(yun); S.yunomi = yun
  const tea = new THREE.Mesh(new THREE.CircleGeometry(0.125, 16), lam(0x9bb35a)); tea.rotation.x = -Math.PI / 2; tea.position.set(0, 0.13, 0); yun.add(tea)
  box(0.22, 0.26, 0.18, lam(0x9aa1a8), -0.55, COUNTER_Y + 0.13, -0.68); box(0.08, 0.06, 0.06, lam(0x2a2a2a), -0.55, COUNTER_Y + 0.2, -0.57)
  const gari = box(0.3, 0.16, 0.22, lam(0x3a2a20), 1.35, COUNTER_Y + 0.08, -1.25); box(0.26, 0.02, 0.18, lam(0xf2b8a8), 0, 0.08, 0, gari)
  const shoyu = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.24, 10), lam(0x2a1210)); shoyu.position.set(1.62, COUNTER_Y + 0.12, -1.25); scene.add(shoyu)
  box(0.08, 0.06, 0.08, lam(0xd83a34), 0, 0.15, 0, shoyu)
})()

// ---------- 皿と寿司
const PLATE_GEO = {}, plateMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
for (const p of D.PLATES) {
  const pts = [[0, 0.035], [0.5, 0.035], [0.52, 0], [0.62, 0], [0.64, 0.03], [0.9, 0.065], [1.0, 0.125], [0.96, 0.13], [0.87, 0.085], [0.0, 0.07]].map(([x, y]) => new THREE.Vector2(x, y))
  const g = new THREE.LatheGeometry(pts, 24), pos = g.attributes.position, cols = []
  const c1 = new THREE.Color(p.col), c2 = new THREE.Color(p.rim), c3 = c1.clone().multiplyScalar(0.8)
  for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getZ(i)), y = pos.getY(i); const c = r > 0.86 && y > 0.075 ? c2 : y < 0.02 ? c3 : c1; cols.push(c.r, c.g, c.b) }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals()
  PLATE_GEO[p.id] = g
}
const NETA = (() => {
  const stripe = (base, line) => canvasTex(64, 32, (x, w, h) => { x.fillStyle = base; x.fillRect(0, 0, w, h); x.strokeStyle = line; x.lineWidth = 3; for (let i = -2; i < 8; i++) { x.beginPath(); x.moveTo(i * 10, 0); x.lineTo(i * 10 + 14, h); x.stroke() } })
  const marble = canvasTex(64, 32, (x, w, h) => { x.fillStyle = '#f4a6b4'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(255,240,240,.9)'; x.lineWidth = 2; for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(0, i * 4); x.bezierCurveTo(20, i * 4 - 3, 40, i * 4 + 3, w, i * 4); x.stroke() } })
  return {
    rice: lam(0xfbf8f0), nori: lam(0x1d2a1a),
    tamago: lam(0xf6d14e), salmon: lam(0xffffff, { map: stripe('#ff8a4c', 'rgba(255,235,215,.85)') }), ebi: lam(0xffffff, { map: stripe('#ff6d4a', '#fff2e8') }),
    maguro: lam(0xc0262f), hamachi: lam(0xf1c7b0), otoro: lam(0xffffff, { map: marble }),
    uni: new THREE.MeshPhongMaterial({ color: 0xf2a33a, shininess: 40 }), ikura: new THREE.MeshPhongMaterial({ color: 0xff5a1f, shininess: 120, specular: 0xffffff }),
    wasabi: lam(0x8cc63f, { flatShading: true }), kappaIn: lam(0x6fae3a),
  }
})()
const G = {
  rice: (() => { const g = new THREE.BoxGeometry(0.34, 0.13, 0.2); return g })(),
  top: (() => { const g = new THREE.BoxGeometry(0.42, 0.05, 0.25, 4, 1, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) - x * x * 0.9) } g.computeVertexNormals(); return g })(),
  band: new THREE.BoxGeometry(0.08, 0.2, 0.27),
  maki: new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12), makiTop: new THREE.CircleGeometry(0.085, 12), makiIn: new THREE.CircleGeometry(0.035, 8),
  gunkan: new THREE.CylinderGeometry(0.14, 0.14, 0.15, 14), roe: new THREE.IcosahedronGeometry(0.04, 0),
  uni: (() => { const g = new THREE.SphereGeometry(0.11, 8, 6); g.scale(1, 0.55, 1.2); return g })(),
  wasabi: (() => { const g = new THREE.IcosahedronGeometry(0.22, 1); const p = g.attributes.position, r = mulberry(5); for (let i = 0; i < p.count; i++) { const k = 0.85 + r() * 0.3; p.setXYZ(i, p.getX(i) * k, Math.max(0, p.getY(i) * k * 0.9), p.getZ(i) * k) } g.computeVertexNormals(); return g })(),
}
function makeNeta(kind) {
  const g = new THREE.Group()
  const nigiri = (topM, dx, band) => {
    const s = new THREE.Group(); s.position.set(dx, 0, 0)
    const r = new THREE.Mesh(G.rice, NETA.rice); r.position.y = 0.065; s.add(r)
    const t = new THREE.Mesh(G.top, topM); t.position.y = 0.15; s.add(t)
    if (band) { const b = new THREE.Mesh(G.band, NETA.nori); b.position.y = 0.1; s.add(b) }
    s.rotation.y = 0.15; g.add(s)
  }
  if (['tamago', 'salmon', 'ebi', 'maguro', 'hamachi', 'otoro'].includes(kind)) { nigiri(NETA[kind], -0.19, kind === 'tamago'); nigiri(NETA[kind], 0.19, kind === 'tamago') }
  else if (kind === 'kappa') for (const dx of [-0.24, 0, 0.24]) { const m = new THREE.Mesh(G.maki, NETA.nori); m.position.set(dx, 0.08, 0); g.add(m); const tp = new THREE.Mesh(G.makiTop, NETA.rice); tp.rotation.x = -Math.PI / 2; tp.position.set(dx, 0.161, 0); g.add(tp); const ci = new THREE.Mesh(G.makiIn, NETA.kappaIn); ci.rotation.x = -Math.PI / 2; ci.position.set(dx, 0.163, 0); g.add(ci) }
  else if (kind === 'uni' || kind === 'ikura') for (const dx of [-0.17, 0.17]) {
    const m = new THREE.Mesh(G.gunkan, NETA.nori); m.position.set(dx, 0.075, 0); g.add(m)
    if (kind === 'uni') { const u = new THREE.Mesh(G.uni, NETA.uni); u.position.set(dx, 0.16, 0); g.add(u) }
    else for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, rr = k ? 0.07 : 0; const e = new THREE.Mesh(G.roe, NETA.ikura); e.position.set(dx + Math.cos(a) * rr, 0.17 + (k ? 0 : 0.02), Math.sin(a) * rr); g.add(e) }
  }
  else if (kind === 'wasabi') { const w = new THREE.Mesh(G.wasabi, NETA.wasabi); w.position.y = 0.02; g.add(w) }
  return g
}
function makePlate(type, withNeta, rng = Math.random) {
  const p = PT[type], g = new THREE.Group()
  const m = new THREE.Mesh(PLATE_GEO[type], plateMat); m.scale.set(p.r, 1, p.r); g.add(m)
  if (withNeta) { const n = makeNeta(p.neta[Math.floor(rng() * p.neta.length)]); n.position.y = 0.075; n.scale.setScalar(p.r / 0.52); g.add(n); g.userData.neta = n }
  g.userData.type = type
  return g
}

// ---------- 人（ちびキャラ）。顔は Canvas の表情テクスチャを差し替える
function faceTex(expr, kind) {
  return canvasTex(128, 128, (x) => {
    x.lineCap = 'round'; x.lineJoin = 'round'
    const ink = '#2a1712', eye = (cx, cy, r = 7) => { x.fillStyle = ink; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(cx + 2, cy - 2, r * 0.35, 0, 7); x.fill() }
    const blush = (a = 0.45) => { x.fillStyle = `rgba(255,120,120,${a})`; for (const cx of [30, 98]) { x.beginPath(); x.ellipse(cx, 80, 11, 7, 0, 0, 7); x.fill() } }
    const brow = (l, r, y = 40) => { x.strokeStyle = ink; x.lineWidth = kind === 'chef' ? 7 : 4.5; x.beginPath(); x.moveTo(34, y + l); x.lineTo(54, y - l); x.stroke(); x.beginPath(); x.moveTo(74, y - r); x.lineTo(94, y + r); x.stroke() }
    const big = (cx, cy) => { x.fillStyle = '#fff'; x.strokeStyle = ink; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, 12, 0, 7); x.fill(); x.stroke(); x.fillStyle = ink; x.beginPath(); x.arc(cx, cy, 3, 0, 7); x.fill() }
    x.strokeStyle = ink; x.fillStyle = ink; x.lineWidth = 4
    switch (expr) {
      case 'normal': eye(44, 60); eye(84, 60); blush(); x.beginPath(); x.arc(64, 78, 12, 0.2, Math.PI - 0.2); x.stroke(); break
      case 'happy': x.lineWidth = 5; x.beginPath(); x.arc(44, 64, 9, Math.PI + 0.3, -0.3); x.stroke(); x.beginPath(); x.arc(84, 64, 9, Math.PI + 0.3, -0.3); x.stroke(); blush(0.6)
        x.fillStyle = '#c0392b'; x.beginPath(); x.moveTo(48, 80); x.quadraticCurveTo(64, 104, 80, 80); x.closePath(); x.fill(); x.stroke(); break
      case 'chew': x.lineWidth = 5; x.beginPath(); x.moveTo(36, 56); x.lineTo(50, 62); x.lineTo(36, 66); x.stroke(); x.beginPath(); x.moveTo(92, 56); x.lineTo(78, 62); x.lineTo(92, 66); x.stroke()
        x.fillStyle = 'rgba(255,130,130,.75)'; for (const cx of [26, 102]) { x.beginPath(); x.ellipse(cx, 82, 16, 13, 0, 0, 7); x.fill() }
        x.strokeStyle = ink; x.lineWidth = 4; x.beginPath(); x.moveTo(52, 86); x.quadraticCurveTo(58, 80, 64, 86); x.quadraticCurveTo(70, 92, 76, 86); x.stroke(); break
      case 'panic': big(44, 58); big(84, 58); brow(-6, -6, 38); x.fillStyle = '#7fc8ff'; x.beginPath(); x.moveTo(108, 30); x.quadraticCurveTo(118, 48, 108, 52); x.quadraticCurveTo(98, 48, 108, 30); x.fill()
        x.strokeStyle = ink; x.lineWidth = 4; x.beginPath(); x.moveTo(46, 88); for (let i = 0; i < 6; i++) x.lineTo(50 + i * 6, i % 2 ? 84 : 92); x.stroke(); break
      case 'shock': big(44, 56); big(84, 56); x.fillStyle = ink; x.beginPath(); x.ellipse(64, 90, 12, 16, 0, 0, 7); x.fill(); x.fillStyle = '#c0392b'; x.beginPath(); x.ellipse(64, 96, 7, 7, 0, 0, 7); x.fill()
        x.strokeStyle = 'rgba(90,110,200,.7)'; x.lineWidth = 3; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(36 + i * 14, 14); x.lineTo(36 + i * 14, 34); x.stroke() } break
      case 'tears': x.lineWidth = 5; x.beginPath(); x.moveTo(34, 54); x.lineTo(52, 60); x.lineTo(34, 66); x.stroke(); x.beginPath(); x.moveTo(94, 54); x.lineTo(76, 60); x.lineTo(94, 66); x.stroke()
        x.fillStyle = '#6fc3ff'; x.fillRect(34, 66, 12, 62); x.fillRect(82, 66, 12, 62); x.fillStyle = '#ff6b5e'; x.beginPath(); x.arc(64, 72, 7, 0, 7); x.fill()
        x.fillStyle = ink; x.beginPath(); x.ellipse(64, 96, 16, 11, 0, 0, 7); x.fill(); break
      case 'yell': brow(8, 8, 36); x.lineWidth = 5; x.beginPath(); x.moveTo(34, 56); x.lineTo(52, 62); x.stroke(); x.beginPath(); x.moveTo(94, 56); x.lineTo(76, 62); x.stroke()
        x.fillStyle = ink; x.beginPath(); x.moveTo(42, 78); x.quadraticCurveTo(64, 74, 86, 78); x.quadraticCurveTo(80, 116, 64, 116); x.quadraticCurveTo(48, 116, 42, 78); x.fill(); x.fillStyle = '#c0392b'; x.beginPath(); x.ellipse(64, 106, 12, 7, 0, 0, 7); x.fill(); break
      case 'stern': brow(-3, -3, 44); eye(44, 62, 6); eye(84, 62, 6); x.lineWidth = 5; x.beginPath(); x.moveTo(52, 88); x.lineTo(76, 88); x.stroke(); break
      case 'smile': x.lineWidth = 5; x.beginPath(); x.arc(44, 64, 8, Math.PI + 0.3, -0.3); x.stroke(); x.beginPath(); x.arc(84, 64, 8, Math.PI + 0.3, -0.3); x.stroke(); blush(0.5); x.beginPath(); x.arc(64, 80, 11, 0.2, Math.PI - 0.2); x.stroke(); break
      case 'yum': x.lineWidth = 5; x.beginPath(); x.arc(44, 62, 8, Math.PI + 0.3, -0.3); x.stroke(); x.beginPath(); x.arc(84, 62, 8, Math.PI + 0.3, -0.3); x.stroke(); blush(0.7); x.fillStyle = '#c0392b'; x.beginPath(); x.ellipse(64, 88, 14, 12, 0, 0, 7); x.fill(); break
    }
    if (kind === 'chef') { x.fillStyle = ink; x.beginPath(); x.moveTo(40, 100); x.quadraticCurveTo(64, 92, 88, 100); x.quadraticCurveTo(64, 110, 40, 100); x.globalAlpha = expr === 'yell' ? 0 : 0.85; x.fill(); x.globalAlpha = 1 }
  })
}
const FACE_CACHE = {}
const faceMat = (expr, kind) => { const k = kind + ':' + expr; if (!FACE_CACHE[k]) FACE_CACHE[k] = new THREE.MeshBasicMaterial({ map: faceTex(expr, kind), transparent: true, alphaTest: 0.05 }); return FACE_CACHE[k] }
const SKIN = lam(0xffd9b8)
function makePerson(o) {
  const g = new THREE.Group(); g.position.set(o.x, 0, o.z)
  const body = new THREE.Group(); g.add(body)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(o.w * 0.8, o.w, 0.75, 14), lam(o.shirt)); torso.position.y = o.seat + 0.38; body.add(torso)
  if (o.tie) { const t = box(0.09, 0.42, 0.03, lam(o.tie), 0, o.seat + 0.42, o.w * 0.86, body) }
  if (o.apron) { const a = new THREE.Mesh(new THREE.CylinderGeometry(o.w * 0.82, o.w * 1.02, 0.6, 14, 1, true, -1.1, 2.2), lam(o.apron, { side: THREE.DoubleSide })); a.position.y = o.seat + 0.3; body.add(a) }
  const head = new THREE.Group(); head.position.y = o.seat + 0.75 + 0.36; body.add(head)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 14), SKIN); head.add(skull)
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), lam(o.hair)); hair.rotation.x = -0.35; hair.position.set(0, 0.03, -0.03); head.add(hair)
  if (o.hat === 'band') { const b = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.06, 6, 20), lam(0xffffff)); b.rotation.x = Math.PI / 2 - 0.25; b.position.y = 0.12; head.add(b); const k = box(0.16, 0.12, 0.08, lam(0xd83a34), 0.0, 0.14, 0.4, head); k.rotation.z = 0.5 }
  if (o.hat === 'cap') { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.34, 16), lam(0xffffff)); c.position.y = 0.38; head.add(c) }
  if (o.hat === 'bandana') { const c = new THREE.Mesh(new THREE.SphereGeometry(0.43, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), lam(o.apron)); c.rotation.x = -0.25; head.add(c) }
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), faceMat(o.face0, o.kind)); face.position.set(0, -0.03, 0.405); head.add(face)
  const armM = lam(o.shirt), arms = []
  for (const side of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(side * (o.w + 0.02), o.seat + 0.66, 0); body.add(a)
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 1, 8), armM); up.geometry.translate(0, -0.5, 0); a.add(up)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), SKIN); a.add(hand)
    arms.push({ g: a, up, hand, len: 0.55 })
  }
  scene.add(g)
  const P = { g, body, head, face, arms, kind: o.kind, expr: o.face0, exprT: 0, base: o.face0, seat: o.seat }
  setArm(P, 0, new THREE.Vector3(-0.4, -0.45, 0.3)); setArm(P, 1, new THREE.Vector3(0.4, -0.45, 0.3))
  return P
}
const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, -1, 0), _q = new THREE.Quaternion()
// 腕を肩からローカル方向 v へ伸ばす（長さも伸びる＝ちびキャラのゴム腕）
function setArm(P, i, v) {
  const a = P.arms[i], len = v.length(); _v.copy(v).normalize()
  a.up.quaternion.setFromUnitVectors(_up, _v); a.up.scale.set(1, len, 1)
  a.hand.position.copy(v)
}
// 世界座標の点へ手を伸ばす
function reachWorld(P, i, w) {
  P.g.updateMatrixWorld(); const a = P.arms[i].g; const loc = a.worldToLocal(_v.copy(w)); setArm(P, i, loc.clone())
}
function setFace(P, expr, sec = 0) { if (P.expr !== expr) { P.expr = expr; P.face.material = faceMat(expr, P.kind) } P.exprT = sec }
const me = makePerson({ kind: 'me', x: ME.x, z: ME.z, seat: 0.93, w: 0.36, shirt: 0xf4f4f0, tie: 0xd83a34, hair: 0x2a1d18, face0: 'normal' })
const nb = makePerson({ kind: 'nb', x: NB.x, z: NB.z, seat: 0.93, w: 0.46, shirt: 0x4f8c5a, hair: 0x4a3020, face0: 'yum' })
const chef = makePerson({ kind: 'chef', x: CHEF0.x, z: CHEF0.z, seat: 0.0, w: 0.4, shirt: 0xfafafa, hair: 0x222222, hat: 'band', face0: 'stern' })
chef.body.scale.setScalar(1.25); chef.g.rotation.y = 0.75
const staff = makePerson({ kind: 'staff', x: 8, z: -2.85, seat: 0.0, w: 0.34, shirt: 0xfafafa, apron: 0x26365e, hair: 0x3a2418, hat: 'bandana', face0: 'smile' })
staff.body.scale.setScalar(1.15)
// 隣の客の皿（3枚）
for (let i = 0; i < 3; i++) { const p = makePlate(['blue', 'white', 'red'][i], false); p.position.set(NB.x - 0.2 + i * 0.02, COUNTER_Y + i * TH, -1.05); scene.add(p) }
// 舟盛り（店員が頭上に掲げて通る）
const boat = (() => {
  const g = new THREE.Group()
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.7, 6, 1, 1), lam(0x9a6a3a)); const p = hull.geometry.attributes.position
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) + x * x * 0.06); if (Math.abs(x) > 1.0) p.setZ(i, p.getZ(i) * 0.5) } hull.geometry.computeVertexNormals(); g.add(hull)
  const mast = box(0.06, 0.6, 0.06, lam(0x6a4a2a), 0.7, 0.4, 0, g); const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.45), lam(0xfbf7ee, { side: THREE.DoubleSide })); sail.position.set(0.7, 0.45, 0.04); g.add(sail)
  for (let i = 0; i < 6; i++) { const n = makeNeta(['maguro', 'salmon', 'otoro', 'ebi', 'hamachi', 'tamago'][i]); n.position.set(-0.95 + i * 0.32, 0.1, 0); n.scale.setScalar(0.7); g.add(n) }
  g.visible = false; scene.add(g); return g
})()

// ---------- タワー
const towerG = new THREE.Group(); scene.add(towerG)
const laneG = new THREE.Group(); scene.add(laneG)
const debrisG = new THREE.Group(); scene.add(debrisG)
// 光の線（タワーの真上から落ちる）
const beamT = canvasTex(32, 128, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,240,170,0)'); g.addColorStop(0.6, 'rgba(255,240,170,.35)'); g.addColorStop(1, 'rgba(255,250,210,.9)'); x.fillStyle = g; x.fillRect(0, 0, w, h) })
const beamM = new THREE.MeshBasicMaterial({ map: beamT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1), beamM); beam.rotation.y = Math.PI / 2; scene.add(beam)
const markM = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })
const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 1.0), markM); mark.rotation.x = -Math.PI / 2; mark.position.set(0, LANE_Y + 0.005, LANE_Z); scene.add(mark)
const baseRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 28), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.6, depthWrite: false })); baseRing.rotation.x = -Math.PI / 2; baseRing.position.set(TOWER_X, COUNTER_Y + 0.004, TOWER_Z); scene.add(baseRing)

function towerH() { return S.tower.length * TH }
// 揺れの大きさ。高いほど・上が重いほど大きい
function swayAmp(n) {
  if (n < 2) return 0
  let m = 0, k = 0; for (let i = Math.max(0, n - 6); i < n; i++) { m += S.tower[i].m; k++ }
  return TUNE.swayK * Math.pow(n, 1.5) * Math.sqrt(m / k) * (1 - 0.12 * Math.min(S.combo, 3))
}
function swayFreq(n) { return Math.max(0.42, 0.95 - 0.016 * n) }
function swayOffset() { return S.sway.A * Math.sin(S.sway.ph) + S.sway.q }
// 各皿の世界 x（揺れ込み）
function plateX(i) { const n = S.tower.length, H = Math.max(TH, n * TH), h = (i + 0.5) * TH, s = swayOffset(); return S.baseX + S.tower[i].X + s * (h / H) * (h / H) }
function topX() { return S.tower.length ? plateX(S.tower.length - 1) : S.baseX }
function topY() { return COUNTER_Y + towerH() }
// 安定判定: 各段の上に載っている皿の重心が、その段の皿からはみ出していないか
function stability() {
  const n = S.tower.length; if (n < 2) return { margin: 1, k: -1, dir: 0 }
  const xs = []; for (let i = 0; i < n; i++) xs.push(plateX(i))
  let sm = 0, sx = 0, worst = 1, wk = -1, dir = 0
  for (let k = n - 2; k >= 0; k--) {
    const p = S.tower[k + 1]; sm += p.m; sx += p.m * xs[k + 1]
    const com = sx / sm, lim = S.tower[k].r * 0.92, off = com - xs[k], mg = (lim - Math.abs(off)) / lim
    if (mg < worst) { worst = mg; wk = k; dir = Math.sign(off) }
  }
  return { margin: worst, k: wk, dir }
}
function stepSway() {
  const n = S.tower.length, sw = S.sway, f = swayFreq(n), w = 2 * Math.PI * f
  const tgt = S.ceil ? 0 : swayAmp(n); sw.A = lerp(sw.A, tgt, 0.03)
  sw.ph += w * DT
  const acc = -w * w * sw.q - 2 * 0.2 * w * sw.qv; sw.qv += acc * DT; sw.q += sw.qv * DT
  if (S.ceil) { sw.q *= 0.9; sw.qv *= 0.9 }
}
function syncTowerMeshes() {
  const n = S.tower.length, H = Math.max(TH, n * TH), s = swayOffset()
  for (let i = 0; i < n; i++) {
    const p = S.tower[i], h = (i + 0.5) * TH
    p.mesh.position.set(plateX(i), COUNTER_Y + i * TH, TOWER_Z)
    p.mesh.rotation.z = -2 * s * h / (H * H) * 0.6
  }
  const tx = topX(), ty = topY()
  beam.position.set(tx, (LANE_Y + ty) / 2 + 0.1, (TOWER_Z + LANE_Z) / 2 + 0.05); beam.scale.set(1, Math.max(0.2, ty - LANE_Y + 0.2), 1)
  mark.position.x = tx
  const on = S.view === 'title' || (S.view === 'play' && (S.phase === 'play' || S.phase === 'ready')); beam.visible = mark.visible = on; baseRing.visible = on && n === 0
  if (on) { const hot = S.lane.some(o => Math.abs(o.x - tx) < 0.045); markM.color.setHex(hot ? 0xffffff : 0xffe27a); beamM.opacity = S.tears > 0 ? 0.35 + Math.random() * 0.4 : 1 }
}

// ---------- レーン
function laneSpeed() { const k = S.view === 'play' ? clamp(S.t / D.GAME_SEC, 0, 1) : 0.2; return 2.15 + 1.05 * k + (S.view === 'play' && S.t > D.GAME_SEC - 10 ? 0.35 : 0) }
function pickType(rng) {
  const k = S.view === 'play' ? clamp(S.t / D.GAME_SEC, 0, 1) : 0.4
  const w = { white: lerp(36, 20, k), blue: lerp(28, 24, k), red: lerp(18, 22, k), gold: lerp(8, 15, k), black: lerp(4, 10, k), wasabi: S.view === 'play' && S.t < 4 ? 0 : 7 }
  let sum = 0; for (const v of Object.values(w)) sum += v
  let r = rng() * sum; for (const [id, v] of Object.entries(w)) { r -= v; if (r <= 0) return id }
  return 'white'
}
function spawnPlate(x, rng, forceType) {
  const type = forceType || pickType(rng), mesh = makePlate(type, true, rng)
  const o = { type, x, mesh, r: PT[type].r, aim: null }
  mesh.position.set(x, LANE_Y, LANE_Z); laneG.add(mesh); S.lane.push(o); return o
}
function stepLane() {
  const v = laneSpeed(), rng = S.view === 'play' ? S.rng : Math.random
  S.beltT.offset.x -= v * DT / 26 * 40
  for (const o of S.lane) { o.x += v * DT; o.mesh.position.x = o.x }
  for (let i = S.lane.length - 1; i >= 0; i--) if (S.lane[i].x > 9) { laneG.remove(S.lane[i].mesh); S.lane.splice(i, 1) }
  S.nextSpawn -= DT
  if (S.nextSpawn <= 0) { spawnPlate(-9, rng); S.nextSpawn = (0.62 + rng() * 0.55) * 2.4 / v }
}
function fillLane(rng) {
  for (const o of S.lane) laneG.remove(o.mesh); S.lane = []
  let x = -9; while (x < 9) { spawnPlate(x, rng); x += 1.5 + rng() * 1.2 }
  S.nextSpawn = 0.5
}

// ---------- 取る・食べる・積む
function grab() {
  if (S.view !== 'play' || S.phase !== 'play' || S.busy > 0) return false
  const tx = topX(); let best = null
  for (const o of S.lane) { const d = o.x - tx; if (Math.abs(d) < REACH && (!best || Math.abs(d) < Math.abs(best.d))) best = { o, d } }
  if (!best) { S.busy = 0.28; fxOno(T('miss'), tx, LANE_Y + 0.3, LANE_Z, ''); Snd.sfx('whiff'); setFace(me, 'panic', 0.4); return false }
  let d = best.d
  if (S.tears > 0) d += (S.rng() - 0.5) * 0.4
  const o = best.o; S.lane.splice(S.lane.indexOf(o), 1)
  S.busy = 0.5; S.eat = { o, d, t: 0, from: o.mesh.position.clone(), chewed: false }
  S.eaten[o.type] = (S.eaten[o.type] || 0) + 1
  Snd.sfx('grab')
  return true
}
const MOUTH = new THREE.Vector3()
function stepEat() {
  const e = S.eat; if (!e) return
  e.t += DT; const m = e.o.mesh
  me.head.getWorldPosition(MOUTH); MOUTH.z += 0.55; MOUTH.y -= 0.2
  const top = new THREE.Vector3(topX() + e.d, topY() + 0.02, TOWER_Z)
  if (e.t < 0.24) { const k = ease(e.t / 0.24); m.position.lerpVectors(e.from, MOUTH, k); m.position.y += Math.sin(k * Math.PI) * 0.4 }
  else if (e.t < 0.34) { m.position.copy(MOUTH) }
  else { const k = ease((e.t - 0.34) / 0.16); m.position.lerpVectors(MOUTH, top, k); m.position.y += Math.sin(k * Math.PI) * 0.3 }
  m.rotation.z = Math.sin(e.t * 20) * 0.08
  reachWorld(me, 1, m.position.clone().add(new THREE.Vector3(0.2, 0.05, 0.1)))
  if (!e.chewed && e.t >= 0.26) {
    e.chewed = true; if (m.userData.neta) m.userData.neta.visible = false
    if (e.o.type === 'wasabi') { S.tears = 3.2; setFace(me, 'tears', 3.2); Snd.sfx('wasabi'); fxOno(T('sayWasabi'), ME.x, 2.6, ME.z + 0.4, 'green'); say(me, T('sayWasabi'), 1.4, true) }
    else { setFace(me, 'chew', 0.45); Snd.sfx('chew'); fxOno(S.lang === 'ja' ? 'もぐっ' : 'nom', ME.x - 0.6, 2.3, ME.z + 0.4, '') }
  }
  if (e.t >= 0.5) { place(e.o, e.d); S.eat = null; setArm(me, 1, new THREE.Vector3(0.4, -0.45, 0.3)) }
}
function place(o, d) {
  const n = S.tower.length, p = PT[o.type], m = o.mesh
  m.rotation.set(0, 0, 0)
  if (n === 0) { d = clamp(d, -0.3, 0.3); S.baseX = TOWER_X + d; d = 0 }
  const top = S.tower[n - 1], lim = top ? top.r * 0.8 : 9
  if (Math.abs(d) > lim) { // すべり落ちる
    S.slips++; S.combo = 0
    debrisG.attach(m)
    S.debris.push({ mesh: m, type: o.type, v: new THREE.Vector3(Math.sign(d) * 1.6, 0.6, 0.9), w: new THREE.Vector3(0, 0, -Math.sign(d) * 6), hits: 0 })
    S.sway.qv += Math.sign(d) * 0.5
    Snd.sfx('slip'); fxOno(T('slip'), topX() + d, topY() + 0.3, TOWER_Z + 0.3, 'red'); say(me, pick(T('saySlip')), 1); setFace(me, 'panic', 0.9); Snd.sfx('ah')
    return
  }
  let X = top ? top.X + d : 0, grade = 'ok'
  if (top && Math.abs(d) < 0.045) { X = top.X; grade = 'perfect'; S.combo++; S.perfects++; S.sway.q *= 0.5; S.sway.qv *= 0.5 }
  else { if (top) S.sway.qv += d * 1.4; S.combo = 0; grade = Math.abs(d) < 0.16 ? 'good' : 'ok' }
  laneG.remove(m); towerG.add(m)
  S.tower.push({ type: o.type, X, r: p.r, m: p.m, mesh: m })
  const ty = topY()
  if (grade === 'perfect') { Snd.sfx('perfect'); fxOno(S.combo > 1 ? T('combo').replace('{n}', S.combo) : T('perfect'), topX(), ty + 0.35, TOWER_Z + 0.3, 'gold'); if (S.combo % 3 === 0) say(me, pick(T('sayPerfect')), 1) }
  else { Snd.sfx('clink', S.tower.length); fxOno(T(grade), topX(), ty + 0.35, TOWER_Z + 0.3, '') }
  billPop()
  const c = S.tower.length
  if (c === 10 && !S.said.c10) { S.said.c10 = 1; say(chef, T('sayChef10'), 2.2) }
  if (c === 18 && !S.said.c18) { S.said.c18 = 1; say(chef, T('sayChef18'), 2.2); setFace(chef, 'panic', 2) }
  if (c === 24 && !S.said.c24) { S.said.c24 = 1; say(staff.g.visible ? staff : chef, T('sayChef24'), 2.2) }
  if (c >= D.CEIL) reachCeil()
}
const pick = a => a[Math.floor(Math.random() * a.length)]

// ---------- 妨害（隣の肘・舟盛り）。種から時刻を決める
function planEvents() {
  const r = S.rng, ev = []
  for (const t0 of [10, 23.5, 36.5]) ev.push({ type: 'elbow', t: t0 + (r() - 0.5) * 4, dir: 1 })
  for (const t0 of [17.5, 31]) ev.push({ type: 'boat', t: t0 + (r() - 0.5) * 3 })
  ev.sort((a, b) => a.t - b.t); return ev
}
function stepEvents() {
  for (const e of S.events) {
    if (e.done) continue
    const lead = e.type === 'boat' ? 1.8 : 1.1
    if (!e.warned && S.t >= e.t - lead) { e.warned = true; S.warn = { txt: T(e.type === 'boat' ? 'warnBoat' : 'warnElbow'), until: e.t + 0.3 }; Snd.sfx('warn'); if (e.type === 'elbow') say(nb, T('sayElbow'), 1.4); if (e.type === 'boat') { say(staff, T('sayBoat'), 2.2); staff.g.visible = true; boat.visible = true } }
    if (e.type === 'boat' && e.warned) {
      // 右から左へ歩く。e.t に舟の先がタワーを通る
      const k = S.t - (e.t - 1.8), sx = 7.5 - k * 3.2; staff.g.position.set(sx, 0, -2.85); staff.g.rotation.y = -Math.PI / 2 + 0.5
      boat.position.set(sx - 0.2, BOAT_Y, -1.6); boat.rotation.y = 0.15
      reachWorld(staff, 0, boat.position.clone().add(new THREE.Vector3(0.4, -0.05, 0))); reachWorld(staff, 1, boat.position.clone().add(new THREE.Vector3(-0.4, -0.05, 0)))
      if (!e.hitDone && sx - 0.2 - 1.2 < topX() + 0.2) {
        e.hitDone = true
        if (topY() > BOAT_Y - 0.12) { S.sway.qv -= 1.25; Snd.sfx('boat'); fxOno(S.lang === 'ja' ? 'ゴツッ' : 'BONK', topX(), BOAT_Y, TOWER_Z + 0.3, 'red'); say(staff, T('sayBoatHit'), 1.4); setFace(staff, 'panic', 1.4); setFace(me, 'panic', 1) }
        else { say(staff, T('sayBoatSafe'), 1.2) }
      }
      if (sx < -9) { e.done = true; staff.g.visible = false; boat.visible = false; setFace(staff, 'smile') }
    }
    if (e.type === 'elbow') {
      const k = S.t - (e.t - 1.1)
      if (k >= 0 && k < 1.6) { const a = k < 1.1 ? ease(k / 1.1) : 1 - ease((k - 1.1) / 0.5); setArm(nb, 1, new THREE.Vector3(0.45 + a * 0.55, -0.35 + a * 0.45, 0.25 - a * 0.1)); setFace(nb, 'yum') }
      if (!e.hitDone && S.t >= e.t) { e.hitDone = true; S.sway.qv += 0.95 * (S.rng() < 0.5 ? 1 : -1); S.shake = 0.25; Snd.sfx('elbow'); fxOno(S.lang === 'ja' ? 'ドンッ' : 'THUD', NB.x + 0.9, COUNTER_Y + 0.4, -1.2, ''); setFace(me, 'panic', 0.8) }
      if (k > 1.6) { e.done = true; setArm(nb, 1, new THREE.Vector3(0.4, -0.45, 0.3)) }
    }
  }
  if (S.warn && S.t > S.warn.until) S.warn = null
}

// ---------- ゲームの流れ
function clearRound() {
  for (const p of S.tower) towerG.remove(p.mesh); S.tower = []
  for (const d of S.debris) debrisG.remove(d.mesh); S.debris = []
  for (const s of S.shards) debrisG.remove(s.mesh); S.shards = []
  if (S.eat) { scene.remove(S.eat.o.mesh); laneG.remove(S.eat.o.mesh); towerG.remove(S.eat.o.mesh); S.eat = null }
  S.sway = { ph: 0, q: 0, qv: 0, A: 0 }; S.baseX = TOWER_X; S.badT = 0; S.margin = 1
  S.busy = 0; S.tears = 0; S.combo = 0; S.eaten = {}; S.slips = 0; S.perfects = 0; S.warn = null; S.said = {}
  S.collapsed = false; S.ceil = false; S.shake = 0; S.result = null
  staff.g.visible = false; boat.visible = false; chef.g.position.set(CHEF0.x, 0, CHEF0.z); chef.g.rotation.y = 0.75
  setFace(me, 'normal'); setFace(chef, 'stern'); setFace(nb, 'yum'); setFace(staff, 'smile')
  for (const P of [me, nb, chef, staff]) { setArm(P, 0, new THREE.Vector3(-0.4, -0.45, 0.3)); setArm(P, 1, new THREE.Vector3(0.4, -0.45, 0.3)); P.body.position.y = 0 }
  clearFx()
}
function startGame(seed) {
  clearRound()
  S.seed = seed ?? Math.floor(Math.random() * 1e9); S.rng = mulberry(S.seed)
  S.view = 'play'; S.phase = 'ready'; S.t = 0; S.phT = 0; S.events = planEvents()
  fillLane(S.rng)
  show('vPlay'); $('#bPause').hidden = false
  if (!S.fast) { Snd.setTrack('play'); Snd.sfx('go'); flashMsg(T('go'), 1.0) }
  S.tutOn = !S.tutSeen; S.tutOk = 0
  camSnap = true; acc = 0; last = performance.now()
}
function goTitle() {
  clearRound(); S.view = 'title'; show('vTitle'); $('#bPause').hidden = true
  // 飾りのタワー
  const r = mulberry(3); S.baseX = TOWER_X
  for (let i = 0; i < 11; i++) { const type = ['white', 'blue', 'white', 'red', 'blue', 'gold', 'white', 'red', 'blue', 'black', 'gold'][i]; const m = makePlate(type, false); towerG.add(m); S.tower.push({ type, X: (r() - 0.5) * 0.12, r: PT[type].r, m: PT[type].m, mesh: m }) }
  fillLane(Math.random)
  const bl = $('#bestLine'); if (S.best > 0) { bl.hidden = false; bl.textContent = `${T('resBest')}  ${S.best}${T('plates') || ' plates'}` } else bl.hidden = true
  Snd.setTrack('title'); camSnap = true
}
function stepPlay() {
  S.phT += DT
  if (S.phase === 'ready') { if (S.phT > 0.9) { S.phase = 'play'; S.phT = 0 } }
  if (S.phase === 'play') {
    S.t += DT
    if (S.busy > 0) S.busy -= DT
    if (S.tears > 0) S.tears -= DT
    stepEvents()
    if (S.bot) botInput()
    const st = stability(); S.margin = st.margin
    if (st.margin < 0) { S.badT += DT; if (S.badT > 0.12) return collapse(st.dir || 1) } else S.badT = Math.max(0, S.badT - DT * 2)
    if (st.margin < 0.28 && S.tower.length > 4 && S.t - S.lastWobble > 1.6) { S.lastWobble = S.t; Snd.sfx('wobble'); fxOno(T('wobble'), topX() + 0.6, topY(), TOWER_Z + 0.3, 'red'); setFace(me, 'panic', 1.2); if (Math.random() < 0.5) say(me, pick(T('sayPanic')), 1.1) }
    if (S.t >= D.GAME_SEC - 10 && !S.said.last) { S.said.last = 1; if (!S.fast) flashMsg(T('last'), 1.0) }
    if (S.tutOn && S.t > 7) { S.tutOn = false; S.tutSeen = true; store.set('tut', '1') }
    if (S.t >= D.GAME_SEC) { S.phase = 'end'; S.phT = 0; S.warn = null; if (!S.fast) { Snd.sfx('bell'); flashMsg(T('timeup'), 1.6, true) } setFace(me, 'happy', 2) }
  } else if (S.phase === 'end') { if (S.phT > 1.8) finish() }
  else if (S.phase === 'collapse') { stepCollapse(); if (S.phT > 3.4) finish() }
  else if (S.phase === 'ceil') { if (S.phT > 2.8) finish() }
  stepEat()
}
function reachCeil() {
  S.ceil = true; S.phase = 'ceil'; S.phT = 0; S.warn = null
  if (S.fast) return
  Snd.sfx('ceiling'); Snd.sfx('cheer'); flashMsg(T('ceiling'), 2.2, true); say(me, T('sayCeil'), 2); setFace(me, 'happy', 3); setFace(chef, 'yell', 3); say(chef, S.lang === 'ja' ? 'あっぱれ！' : 'Bravo!', 2)
  confetti()
}
function collapse(dir) {
  S.collapsed = true; S.phase = 'collapse'; S.phT = 0; S.warn = null; S.collapseN = S.tower.length
  if (S.eat) { S.eat.o.mesh.visible = false; S.eat = null }
  const n = S.tower.length
  for (let i = 0; i < n; i++) {
    const p = S.tower[i], h = i / Math.max(1, n - 1), r = S.rng
    debrisG.attach(p.mesh)
    S.debris.push({ mesh: p.mesh, type: p.type, delay: (1 - h) * 0.25 + r() * 0.05, v: new THREE.Vector3(dir * (0.4 + h * 2.0 + r() * 0.8), 0.4 + r() * 1.6, (r() - 0.35) * 1.4), w: new THREE.Vector3((r() - 0.5) * 8, (r() - 0.5) * 4, -dir * (3 + r() * 8)), hits: 0 })
  }
  S.tower = []
  if (S.fast) return
  Snd.sfx('crash'); S.shake = 1.0
  flashMsg(T('crash'), 2.4, true); $('#flash').style.transition = 'none'; $('#flash').style.opacity = '0.8'; requestAnimationFrame(() => { $('#flash').style.transition = 'opacity .5s'; $('#flash').style.opacity = '0' })
  setFace(me, 'shock', 9); setFace(nb, 'shock', 9); setFace(chef, 'yell', 9); setFace(staff, 'yell', 9)
  staff.g.visible = true; boat.visible = false; staff.g.position.set(6.5, 0, -2.85)
  S.crashT = 0
}
function stepCollapse() {
  const k = S.phT
  // 板前と店員が駆け寄る
  // 板前は厨房から客席側へ回り込んで駆けつける
  if (k < 0.25) { chef.g.position.set(CHEF0.x - k * 8, 0, CHEF0.z) } else { chef.g.position.set(lerp(-6.5, -1.75, ease((k - 0.25) / 0.75)), 0, -3.0); chef.g.rotation.y = lerp(1.2, 0.15, ease((k - 0.6) / 0.6)) } chef.body.position.y = Math.abs(Math.sin(k * 14)) * 0.12 * (k < 1.1 ? 1 : 0.3)
  staff.g.position.x = lerp(6.5, 1.55, ease((k - 0.3) / 0.9)); staff.g.rotation.y = lerp(-1.2, 0, ease(k - 0.6)); staff.body.position.y = Math.abs(Math.sin(k * 15)) * 0.1
  for (const P of [chef, staff]) { const a = ease(k * 2); setArm(P, 0, new THREE.Vector3(-0.35 - a * 0.25, -0.4 + a * 1.15, 0.2)); setArm(P, 1, new THREE.Vector3(0.35 + a * 0.25, -0.4 + a * 1.15, 0.2)) }
  const ma = Math.sin(k * 9) * 0.2; setArm(me, 0, new THREE.Vector3(-0.3, 0.55 + ma, 0.35)); setArm(me, 1, new THREE.Vector3(0.3, 0.55 - ma, 0.35))
  if (!S.fast) {
    if (k > 0.55 && !S.said.ck) { S.said.ck = 1; say(chef, T('sayCrashChef'), 2.6, true); Snd.sfx('okyaku') }
    if (k > 0.95 && !S.said.cs) { S.said.cs = 1; say(staff, T('sayCrashStaff'), 2.2, true) }
    if (k > 1.7 && !S.said.cm) { S.said.cm = 1; say(me, T('sayCrashMe'), 1.6); Snd.sfx('eek') }
  }
}
function finish() {
  S.result = computeResult(); S.view = 'result'; $('#bPause').hidden = true
  if (S.result.count > S.best) { S.best = S.result.count; store.set('best', String(S.best)); S.result.newBest = true }
  if (S.fast) return
  show('vResult'); fillResult(); camSnap = false
}
function computeResult() {
  const lines = []; let sub = 0, eaten = 0
  for (const p of D.PLATES) { const q = S.eaten[p.id] || 0; if (!q) continue; eaten += q; lines.push({ id: p.id, q, price: p.price, sum: q * p.price }); sub += q * p.price }
  const count = S.collapsed ? S.collapseN : S.tower.length
  const broken = S.slips + (S.collapsed ? count : 0)
  const fee = broken * D.BREAK_FEE; sub += fee
  const tax = Math.floor(sub * 0.1), total = sub + tax
  const score = S.ceil ? 99 : S.collapsed ? count * 0.6 : count
  let tier = D.TIERS.find(t => score >= t.min)
  if (S.collapsed && score < 6) tier = D.BREAKER
  return { count, cm: Math.round(count * D.CM_PER_PLATE), lines, broken, fee, sub, tax, total, eaten, collapsed: S.collapsed, ceil: S.ceil, tier: tier.id, score, perfects: S.perfects, slips: S.slips, seed: S.seed }
}
const tierOf = id => id === 'breaker' ? D.BREAKER : D.TIERS.find(t => t.id === id)

// ---------- 崩れた皿・破片
const shardG = new THREE.TetrahedronGeometry(0.17, 0); shardG.scale(1, 0.3, 1)
const shardMats = {}
function shatter(mesh, type, pos, vel) {
  debrisG.remove(mesh)
  const p = PT[type]; if (!shardMats[type]) shardMats[type] = lam(p.col)
  const n = S.fast ? 0 : 6
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(shardG, i % 3 ? shardMats[type] : lam(p.rim)); s.position.copy(pos); debrisG.add(s)
    S.shards.push({ mesh: s, v: new THREE.Vector3(vel.x * 0.15 + (Math.random() - 0.5) * 1.6, 0.8 + Math.random() * 1.6, vel.z * 0.1 + (Math.random() - 0.5) * 1.2), w: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10), rest: false })
  }
  if (!S.fast && S.simT - (S.lastSmash || 0) > 0.07) { S.lastSmash = S.simT; Snd.sfx('smash') }
}
function groundY(x, z) { if (z > -1.7 && z < -0.5 && Math.abs(x) < 13) return COUNTER_Y; if (Math.abs(z - LANE_Z) <= 0.55) return LANE_Y; if (z > 0.6 && z < 2.05) return 0.96; return 0 }
function stepDebris() {
  for (let i = S.debris.length - 1; i >= 0; i--) {
    const d = S.debris[i]
    if (d.delay > 0) { d.delay -= DT; continue }
    d.v.y -= 9.8 * DT; d.mesh.position.addScaledVector(d.v, DT)
    d.mesh.rotation.x += d.w.x * DT; d.mesh.rotation.y += d.w.y * DT; d.mesh.rotation.z += d.w.z * DT
    const p = d.mesh.position, gy = groundY(p.x, p.z)
    if (p.y < gy && d.v.y < 0) {
      if (Math.abs(d.v.y) > 2.2 || d.hits >= 1) { shatter(d.mesh, d.type, p.clone(), d.v); S.debris.splice(i, 1) }
      else { p.y = gy; d.v.y *= -0.35; d.v.x *= 0.6; d.v.z *= 0.6; d.hits++ }
    }
  }
  for (const s of S.shards) {
    if (s.rest) continue
    s.v.y -= 9.8 * DT; s.mesh.position.addScaledVector(s.v, DT); s.mesh.rotation.x += s.w.x * DT; s.mesh.rotation.z += s.w.z * DT
    const p = s.mesh.position, gy = groundY(p.x, p.z) + 0.01
    if (p.y < gy) { p.y = gy; s.v.y *= -0.3; s.v.x *= 0.5; s.v.z *= 0.5; if (Math.abs(s.v.y) < 0.4) s.rest = true }
  }
}

// ---------- キャラの動き（待機・表情の戻り）
function stepChars() {
  const t = S.simT
  for (const P of [me, nb, chef, staff]) { if (P.exprT > 0) { P.exprT -= DT; if (P.exprT <= 0) setFace(P, P.base) } }
  me.head.rotation.z = Math.sin(t * 1.3) * 0.04; me.head.rotation.x = -0.12
  if (S.view === 'title') { const k = (t % 2.4); if (k < DT) { setFace(me, 'chew', 0.6) } }
  nb.head.rotation.z = Math.sin(t * 2.1 + 1) * 0.06
  if (S.phase !== 'collapse' || S.view !== 'play') { chef.head.rotation.y = Math.sin(t * 0.7) * 0.2 }
  if (S.view === 'play' && S.phase === 'play' && S.margin < 0.28 && S.tower.length > 4 && me.expr === 'normal') setFace(me, 'panic', 0.3)
}

// ---------- 台本のボット（難易度の分布を測る）
const BOTS = { good: { sd: 0.05, skipW: 1, fix: 0.45, lag: 0, care: 0.4 }, normal: { sd: 0.13, skipW: 0.5, fix: 0, lag: 0.03, care: 0.12 }, sloppy: { sd: 0.3, skipW: 0, fix: 0, lag: 0.06, spam: 0.01 }, none: null }
function botInput() {
  const b = BOTS[S.bot]; if (!b || S.busy > 0) return
  if (b.spam && S.rng() < b.spam) { grab(); return }
  // 揺れが危ない間は取らずに待つ（上手い人ほど慎重）
  if (b.care && S.tower.length > 6 && S.margin < b.care) return
  const tx = topX()
  // 傾きを戻す向きに狙う（上手い人だけ）
  let bias = 0
  if (b.fix && S.tower.length > 1) { const st = stability(); const top = S.tower[S.tower.length - 1]; bias = -clamp(top.X * b.fix, -0.15, 0.15) }
  for (const o of S.lane) {
    if (o.aim == null) { o.aim = (gauss(S.rng) * b.sd); o.skip = o.type === 'wasabi' && S.rng() < b.skipW }
    if (o.skip) continue
    const d = o.x - tx
    if (d > -REACH && d < REACH * 0.6 && d >= o.aim + bias - b.lag * laneSpeed()) { grab(); return }
  }
}
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }

// ---------- 画面の文字・演出（DOM）
function show(id) { for (const v of document.querySelectorAll('main.view')) v.hidden = v.id !== id }
function applyLang() {
  document.documentElement.lang = S.lang
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = T(el.dataset.t)
  $('#bLang').textContent = S.lang === 'ja' ? 'EN' : 'JA'
  $('#ctrlLine').textContent = isTouch ? T('ctrlTouch') : T('ctrlPc')
  $('#tutTxt').textContent = isTouch ? T('tutTouch') : T('tutPc')
  document.title = S.lang === 'ja' ? '回転寿司の皿タワー | SUSHI PLATE TOWER' : 'SUSHI PLATE TOWER'
  if (S.view === 'result' && S.result) fillResult(true)
  if (S.view === 'title') { const bl = $('#bestLine'); if (S.best > 0) bl.textContent = `${T('resBest')}  ${S.best}${T('plates') || ' plates'}` }
}
function applyMute() { Snd.setMute(S.muted); const b = $('#bMute'); b.querySelector('.on').style.display = S.muted ? 'none' : ''; b.querySelector('.off').style.display = S.muted ? '' : 'none' }
const fxBox = $('#fx'), FX = { ono: [], bub: [] }
const tmpV = new THREE.Vector3()
function toScreen(x, y, z) { tmpV.set(x, y, z).project(camera); return { x: (tmpV.x + 1) / 2 * innerWidth, y: (1 - tmpV.y) / 2 * innerHeight } }
function fxOno(txt, x, y, z, cls) {
  if (S.fast) return
  const p = toScreen(x, y, z), d = document.createElement('div'); d.className = 'ono ' + cls; d.textContent = txt
  d.style.left = clamp(p.x, 70, innerWidth - 70) + 'px'; d.style.top = clamp(p.y, 90, innerHeight - 40) + 'px'; fxBox.appendChild(d); setTimeout(() => d.remove(), 850)
}
function say(P, txt, sec, shout) {
  if (S.fast) return
  for (const b of FX.bub) if (b.P === P) b.el.remove()
  FX.bub = FX.bub.filter(b => b.P !== P)
  const el = document.createElement('div'); el.className = 'bub' + (shout ? ' shout' : ''); el.textContent = txt; fxBox.appendChild(el)
  FX.bub.push({ P, el, until: S.simT + sec })
}
function clearFx() { fxBox.innerHTML = ''; FX.bub = []; $('#msg').hidden = true; $('#warn').hidden = true }
const _hp = new THREE.Vector3()
function placeBubbles() {
  for (let i = FX.bub.length - 1; i >= 0; i--) {
    const b = FX.bub[i]
    if (S.simT > b.until || !b.P.g.visible) { b.el.remove(); FX.bub.splice(i, 1); continue }
    b.P.head.getWorldPosition(_hp); _hp.y += 0.55 * b.P.body.scale.y; if (b.P === me) { _hp.x += 0.75; _hp.y -= 0.25 } else if (b.P === chef) _hp.x -= 0.2
    const p = toScreen(_hp.x, _hp.y, _hp.z), w = b.el.offsetWidth / 2 + 6
    b.el.style.left = clamp(p.x, w, innerWidth - w) + 'px'; b.el.style.top = clamp(p.y, 60 + b.el.offsetHeight, innerHeight - 10) + 'px'
  }
}
let msgTimer = 0
function flashMsg(txt, sec, big) { const m = $('#msg'); m.hidden = false; m.className = 'msg' + (big ? ' huge' : ''); m.textContent = txt; void m.offsetWidth; m.style.animation = 'none'; void m.offsetWidth; m.style.animation = ''; clearTimeout(msgTimer); msgTimer = setTimeout(() => { m.hidden = true }, sec * 1000) }
function billPop() { if (S.fast) return; const b = $('#hBillBox'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop') }
function confetti() {
  for (let i = 0; i < 60; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.12), new THREE.MeshBasicMaterial({ color: [0xd83a34, 0xf2c14e, 0x3d7bd9, 0xffffff, 0x7cbf3a][i % 5], side: THREE.DoubleSide }))
    m.position.set(TOWER_X + (Math.random() - 0.5) * 4, CEIL_Y - 0.2, TOWER_Z + (Math.random() - 0.5) * 2); debrisG.add(m)
    S.shards.push({ mesh: m, v: new THREE.Vector3((Math.random() - 0.5) * 1.5, -0.5 - Math.random(), (Math.random() - 0.5) * 1.5), w: new THREE.Vector3(Math.random() * 8, 0, Math.random() * 8), rest: false })
  }
}
const H = { last: {} }
function setText(id, v) { if (H.last[id] !== v) { H.last[id] = v; $('#' + id).textContent = v } }
function yen(n) { return n.toLocaleString('ja-JP') }
function hud() {
  if (S.view !== 'play') return
  const left = Math.max(0, D.GAME_SEC - S.t)
  $('#timeBar').style.transform = `scaleX(${left / D.GAME_SEC})`
  setText('timeNum', String(Math.ceil(left)))
  const hurry = left <= 10 && S.phase === 'play'; if (H.last.hurry !== hurry) { H.last.hurry = hurry; $('#timer').classList.toggle('hurry', hurry) }
  setText('hPlates', String(S.collapsed ? 0 : S.tower.length)); setText('hHeight', Math.round((S.collapsed ? 0 : S.tower.length) * D.CM_PER_PLATE) + T('cm'))
  let bill = 0; for (const p of D.PLATES) bill += (S.eaten[p.id] || 0) * p.price
  setText('hBill', '¥' + yen(bill))
  const cb = $('#hCombo'); if (S.combo >= 2) { cb.hidden = false; setText('hCombo', T('combo').replace('{n}', S.combo)) } else cb.hidden = true
  const w = $('#warn'); if (S.warn) { w.hidden = false; setText('warnTxt', S.warn.txt) } else w.hidden = true
  $('#tut').hidden = !(S.tutOn && S.phase !== 'end')
  $('#tears').classList.toggle('on', S.tears > 0)
}

// ---------- 結果（レシート）
let revealTimers = []
function fillResult(instant) {
  const R = S.result, tier = tierOf(R.tier)
  revealTimers.forEach(clearTimeout); revealTimers = []
  const later = (ms, f) => { if (instant) f(); else revealTimers.push(setTimeout(f, ms)) }
  $('#rCount').innerHTML = `${R.count}<small>${T('plates') || ''}</small>`; $('#rHeight').innerHTML = `${R.cm}<small>cm</small>`
  const bd = $('#rBadge'); bd.hidden = !(R.collapsed || R.ceil); bd.textContent = R.ceil ? T('resCeil') : T('resCollapsed'); bd.classList.toggle('ceil', R.ceil)
  const now = new Date(), pad = n => String(n).padStart(2, '0')
  $('#rcDate').textContent = `${T('receiptNo')}  ${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  const box = $('#rcLines'); box.innerHTML = ''
  const rows = R.lines.map(l => ({ c: PT[l.id].css, nm: PT[l.id][S.lang], q: l.q, p: l.sum }))
  if (R.broken) rows.push({ c: '#fff', nm: T('receiptBreak'), q: R.broken, p: R.fee, brk: true })
  if (!rows.length) rows.push({ c: '#9bb35a', nm: S.lang === 'ja' ? 'お茶（おかわり）' : 'Tea (refill)', q: 3, p: 0 })
  const sumEl = $('#rcSum'), st = $('#rStamp'); sumEl.classList.remove('on'); st.style.visibility = 'hidden'; st.classList.remove('show')
  for (const id of ['#rTop', '#rBtns']) $(id).classList.toggle('on', !!instant)
  later(200, () => $('#rTop').classList.add('on'))
  rows.forEach((r, i) => later(400 + i * 220, () => {
    const d = document.createElement('div'); d.className = 'rcL' + (instant ? '' : ' in') + (r.brk ? ' brk' : '')
    d.innerHTML = `<i style="background:${r.c}"></i><span class="nm"></span><span class="q">x${r.q}</span><span class="p">¥${yen(r.p)}</span>`
    d.querySelector('.nm').textContent = r.nm; box.appendChild(d); if (!instant) Snd.sfx('print')
  }))
  const tSum = 400 + rows.length * 220 + 200
  later(tSum, () => {
    sumEl.classList.add('on'); $('#rcSub').textContent = '¥' + yen(R.sub); $('#rcTax').textContent = '¥' + yen(R.tax)
    if (instant) { $('#rcTotal').textContent = '¥' + yen(R.total); return }
    Snd.sfx('drum'); const t0 = performance.now(), dur = 1100
    const tick = () => { const k = Math.min(1, (performance.now() - t0) / dur); $('#rcTotal').textContent = '¥' + yen(Math.round(R.total * (1 - Math.pow(1 - k, 3)))); if (k < 1 && S.view === 'result') requestAnimationFrame(tick); else if (k >= 1) Snd.sfx('register') }
    tick()
  })
  later(tSum + 1500, () => {
    st.innerHTML = ''; const sm = document.createElement('small'); sm.textContent = tier.id === 'breaker' ? 'GOD OF DESTRUCTION' : 'TITLE'; st.appendChild(sm); st.appendChild(document.createTextNode(tier[S.lang]))
    st.style.color = tier.color; st.style.visibility = 'visible'; if (!instant) { st.classList.add('show'); Snd.sfx('stamp') }
    if (!instant) { if (R.collapsed) { Snd.setTrack('sad'); Snd.sfx('boo') } else { Snd.setTrack('result'); Snd.sfx('cheer') } }
    if (!instant && !R.collapsed) setFace(me, 'happy', 99)
  })
  later(tSum + 1900, () => $('#rBtns').classList.add('on'))
}

// ---------- 結果を1枚の画像に（1080x1350・レシート）
async function makeCard() {
  const R = S.result, tier = tierOf(R.tier), ja = S.lang === 'ja'
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const x = c.getContext('2d')
  // 3D の場面（タワーかがれき）
  syncTowerMeshes()
  const pr = renderer.getPixelRatio(); renderer.setPixelRatio(1); renderer.setSize(1080, 760, false)
  const cp = camera.position.clone(), cq = camera.quaternion.clone(), fov = camera.fov
  camera.aspect = 1080 / 760; camera.fov = 46
  const fr = R.collapsed ? frameFor(0.4, 2.8, 1080 / 760, 2.6, { x0: 0, x1: 1, y0: 0.32, y1: 0.86 }, null, -0.6) : frameFor(0.75, Math.max(2.6, topY() + 0.4), 1080 / 760, 1.4, { x0: 0.42, x1: 1, y0: 0.06, y1: 0.86 }, null, TOWER_X - 0.2)
  camera.position.copy(fr.pos); camera.lookAt(fr.look); camera.updateProjectionMatrix()
  renderer.render(scene, camera)
  x.fillStyle = '#2a1712'; x.fillRect(0, 0, 1080, 1350)
  x.drawImage(renderer.domElement, 0, 0, 1080, 760)
  camera.position.copy(cp); camera.quaternion.copy(cq); camera.fov = fov; renderer.setPixelRatio(pr); resize()
  try { await Promise.all(['56px "Dela Gothic One"', '30px "DotGothic16"', '900 30px "M PLUS Rounded 1c"'].map(f => document.fonts.load(f))); await document.fonts.ready } catch (e) {}
  const g = x.createLinearGradient(0, 0, 0, 760); g.addColorStop(0, 'rgba(42,23,18,.9)'); g.addColorStop(0.16, 'rgba(42,23,18,0)'); g.addColorStop(0.8, 'rgba(42,23,18,0)'); g.addColorStop(1, 'rgba(42,23,18,1)'); x.fillStyle = g; x.fillRect(0, 0, 1080, 760)
  // タイトル
  x.textAlign = 'left'; x.fillStyle = '#fff'; x.font = "60px 'Dela Gothic One',sans-serif"; x.lineWidth = 10; x.strokeStyle = '#8f1d1a'; x.lineJoin = 'round'
  const tt = T('cardTitle'); x.strokeText(tt, 54, 104); x.fillText(tt, 54, 104)
  // 大きい数字（左上）
  x.font = "900 30px 'M PLUS Rounded 1c',sans-serif"; x.fillStyle = '#f1dcb4'; x.fillText(T('resCount') + ' / ' + T('resHeight'), 56, 160)
  x.font = "92px 'Dela Gothic One',sans-serif"; x.fillStyle = '#fff'; x.strokeStyle = '#2a1712'; x.lineWidth = 12
  const big = `${R.count}${ja ? '枚' : ''}  ${R.cm}cm`; x.strokeText(big, 54, 260); x.fillText(big, 54, 260)
  if (R.collapsed || R.ceil) { x.save(); x.translate(880, 150); x.rotate(0.1); x.fillStyle = R.ceil ? '#f2c14e' : '#d83a34'; roundRect(x, -150, -44, 300, 80, 16); x.fill(); x.fillStyle = R.ceil ? '#1d1410' : '#fff'; x.font = "44px 'Dela Gothic One',sans-serif"; x.textAlign = 'center'; x.fillText(R.ceil ? T('resCeil') : T('resCollapsed'), 0, 14); x.restore() }
  // レシート
  const RX = 150, RY = 640, RW = 780, RH = 640
  x.save(); x.translate(540, RY + RH / 2); x.rotate(-0.012); x.translate(-540, -(RY + RH / 2))
  x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 30; x.shadowOffsetY = 12
  x.fillStyle = '#fbf7ee'; x.beginPath(); x.moveTo(RX, RY)
  for (let i = 0; i <= 26; i++) x.lineTo(RX + i * RW / 26, RY + (i % 2 ? 12 : 0))
  x.lineTo(RX + RW, RY + RH); for (let i = 26; i >= 0; i--) x.lineTo(RX + i * RW / 26, RY + RH - (i % 2 ? 14 : 0)); x.closePath(); x.fill(); x.shadowColor = 'transparent'
  x.fillStyle = '#1d1410'; x.textAlign = 'center'; x.font = "38px 'DotGothic16',monospace"; x.fillText(T('receiptShop'), 540, RY + 70)
  x.font = "24px 'DotGothic16',monospace"; x.fillStyle = '#8a7a6a'; x.fillText(T('receiptNo'), 540, RY + 104)
  const dash = y => { x.strokeStyle = '#b9ad98'; x.lineWidth = 3; x.setLineDash([12, 9]); x.beginPath(); x.moveTo(RX + 40, y); x.lineTo(RX + RW - 40, y); x.stroke(); x.setLineDash([]) }
  dash(RY + 124)
  const rows = R.lines.map(l => [PT[l.id].css, PT[l.id][S.lang], l.q, l.sum, false]); if (R.broken) rows.push(['#fff', T('receiptBreak'), R.broken, R.fee, true])
  if (!rows.length) rows.push(['#9bb35a', ja ? 'お茶（おかわり）' : 'Tea (refill)', 3, 0, false])
  const lh = Math.min(44, 250 / rows.length); let y = RY + 166
  x.font = "32px 'DotGothic16',monospace"
  for (const [col, nm, q, p, brk] of rows) {
    x.fillStyle = col; x.beginPath(); x.arc(RX + 62, y - 10, 13, 0, 7); x.fill(); x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 3; x.stroke()
    x.fillStyle = brk ? '#d83a34' : '#1d1410'; x.textAlign = 'left'; x.fillText(nm, RX + 88, y); x.fillStyle = '#8a7a6a'; x.fillText('x' + q, RX + 420, y)
    x.fillStyle = brk ? '#d83a34' : '#1d1410'; x.textAlign = 'right'; x.fillText('¥' + yen(p), RX + RW - 50, y); y += lh
  }
  dash(RY + 438)
  x.font = "28px 'DotGothic16',monospace"; x.fillStyle = '#5a4a3c'; x.textAlign = 'left'; x.fillText(T('receiptTax'), RX + 50, RY + 476); x.textAlign = 'right'; x.fillText('¥' + yen(R.tax), RX + RW - 50, RY + 476)
  x.fillStyle = '#1d1410'; x.textAlign = 'left'; x.font = "38px 'DotGothic16',monospace"; x.fillText(T('receiptTotal'), RX + 50, RY + 548)
  x.textAlign = 'right'; x.font = "76px 'DotGothic16',monospace"; x.fillText('¥' + yen(R.total), RX + RW - 50, RY + 556)
  x.textAlign = 'center'; x.font = "22px 'DotGothic16',monospace"; x.fillStyle = '#8a7a6a'; x.fillText(T('receiptNote'), 540, RY + 604)
  x.restore()
  // ハンコ（称号）
  x.save(); x.translate(690, 600); x.rotate(-0.16)
  let fs = 70; x.font = `${fs}px 'Dela Gothic One',sans-serif`; const name = tier[S.lang]
  while (x.measureText(name).width > 640 && fs > 36) { fs -= 4; x.font = `${fs}px 'Dela Gothic One',sans-serif` }
  const tw = x.measureText(name).width + 80
  x.fillStyle = 'rgba(251,247,238,.9)'; roundRect(x, -tw / 2, -96, tw, 150, 22); x.fill()
  x.strokeStyle = tier.color; x.lineWidth = 12; roundRect(x, -tw / 2 + 10, -86, tw - 20, 130, 16); x.stroke()
  x.fillStyle = tier.color; x.textAlign = 'center'; x.font = "900 24px 'M PLUS Rounded 1c',sans-serif"; x.fillText(tier.id === 'breaker' ? 'GOD OF DESTRUCTION' : 'TITLE', 0, -50)
  x.font = `${fs}px 'Dela Gothic One',sans-serif`; x.fillText(name, 0, 22); x.restore()
  x.textAlign = 'center'; x.font = "800 26px 'M PLUS Rounded 1c',sans-serif"; x.fillStyle = '#f1dcb4'; x.fillText('tom3games.github.io/sushi-tower', 540, 1326)
  return c
}
function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.roundRect(X, Y, w, h, r) }
async function saveImage() {
  const c = await makeCard(), blob = await new Promise(r => c.toBlob(r, 'image/png'))
  const tier = tierOf(S.result.tier), file = new File([blob], 'sushi-tower.png', { type: 'image/png' })
  const text = T('shareText').replace('{t}', tier[S.lang]).replace('{n}', S.result.count).replace('{b}', yen(S.result.total)) + ' https://tom3games.github.io/sushi-tower/'
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text }); return blob } catch (e) { if (e && e.name === 'AbortError') return blob } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sushi-tower.png'; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast(T('saved')); return blob
}
function toast(s) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = s; document.body.appendChild(d); setTimeout(() => d.remove(), 1600) }

// ---------- カメラ
let camSnap = true
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3()
// 世界の範囲（y: lo〜hi、x: cx±halfW）を、画面の区画 rg（0〜1、y は上から）に収めるカメラ。anchor='bottom' なら余りを上に回す
function frameFor(lo, hi, aspect, halfW, rg = { x0: 0, x1: 1, y0: 0, y1: 1 }, anchor, cx = TOWER_X - 0.3) {
  const f = Math.tan(camera.fov * Math.PI / 360), pitch = 0.36
  const dv = (hi - lo) / ((rg.y1 - rg.y0) * 2 * f) * 1.04, dh = halfW / ((rg.x1 - rg.x0) * f * aspect)
  const d = Math.max(dv, dh, 4.2), hv = d * f, hw = hv * aspect
  const ncx = rg.x0 + rg.x1 - 1, ncy = 1 - (rg.y0 + rg.y1)
  let ly = (lo + hi) / 2 - ncy * hv
  if (anchor === 'bottom') ly = lo - (1 - 2 * rg.y1) * hv
  const look = new THREE.Vector3(cx - ncx * hw, ly, -0.75)
  // カメラは天井より下に置く（梁がお品書きに被らないように）
  const p2 = clamp(Math.asin(clamp((CEIL_Y - 0.25 - look.y) / d, -1, 1)), 0.05, pitch)
  return { look, pos: new THREE.Vector3(look.x + 0.4, look.y + Math.sin(p2) * d, look.z + Math.cos(p2) * d) }
}
function stepCamera() {
  const W = innerWidth, Hh = innerHeight, asp = W / Hh, portrait = asp < 0.9
  let fr
  if (S.view === 'result') {
    // 結果は場面を上（縦）か左（横）に寄せる
    const lo = S.collapsed ? 0.45 : 0.75, hi = S.collapsed ? 2.75 : Math.max(2.6, topY() + 0.35)
    fr = portrait ? frameFor(lo, hi, asp, S.collapsed ? 1.9 : 1.5, { x0: 0, x1: 1, y0: 0.07, y1: resultSceneBottom() }, null, S.collapsed ? 0.1 : TOWER_X - 0.3) : frameFor(lo, hi, asp, 1.6, { x0: 0, x1: 0.4, y0: 0.04, y1: 0.96 }, null, S.collapsed ? 0.1 : TOWER_X - 0.4)
  } else if (S.view === 'play' && S.phase === 'collapse') {
    fr = frameFor(0.5, 3.0, asp, portrait ? 2.3 : 3.2, { x0: 0, x1: 1, y0: 0.12, y1: 0.9 }, 'bottom', -0.3)
  } else {
    const hi = Math.max(2.6, topY() + 0.5)
    fr = frameFor(portrait ? 0.45 : 0.62, hi, asp, portrait ? 1.7 : asp < 1.9 ? 3.0 : 2.6, { x0: 0, x1: 1, y0: S.view === 'title' ? 0.3 : 0.12, y1: S.view === 'title' && portrait ? 0.8 : 0.98 }, 'bottom')
  }
  if (S.view === 'title') { const t = S.simT; fr.pos.x += Math.sin(t * 0.25) * 0.8 }
  if (camSnap) { camPos.copy(fr.pos); camLook.copy(fr.look); camSnap = false } else { camPos.lerp(fr.pos, 0.05); camLook.lerp(fr.look, 0.06) }
  camera.position.copy(camPos)
  if (S.shake > 0) { S.shake = Math.max(0, S.shake - DT * 1.2); camera.position.x += (Math.random() - 0.5) * S.shake * 0.25; camera.position.y += (Math.random() - 0.5) * S.shake * 0.25 }
  camera.lookAt(camLook)
}
// 結果画面でレシートより上に空いている割合
let rsb = 0.42
function resultSceneBottom() { return rsb }
function measureResult() { const el = document.querySelector('.rWrap'); if (!el || S.view !== 'result') return; const top = el.getBoundingClientRect().top; rsb = clamp((top - 8) / innerHeight, 0.25, 0.7) }

// ---------- 1ステップ
function step() {
  S.simT += DT
  if (S.view === 'play') stepPlay()
  stepSway(); stepLane(); stepDebris(); stepChars()
  if (S.view !== 'title' || true) syncTowerMeshes()
  stepCamera()
}

// ---------- 画面遷移・入力
function pauseGame(on) {
  if (on && S.view === 'play') { S.view = 'pause'; show('vPause') }
  else if (!on && S.view === 'pause') { S.view = 'play'; show('vPlay'); last = performance.now(); acc = 0 }
}
document.addEventListener('pointerdown', () => Snd.init(), { capture: true })
document.addEventListener('keydown', () => Snd.init(), { capture: true })
$('#bStart').onclick = () => { Snd.sfx('tap'); startGame() }
$('#bHow').onclick = () => { Snd.sfx('tap'); S.view = 'how'; show('vHow') }
$('#bHowBack').onclick = () => { Snd.sfx('tap'); goTitle() }
$('#bHowGo').onclick = () => { Snd.sfx('tap'); startGame() }
$('#bAgain').onclick = () => { Snd.sfx('tap'); revealTimers.forEach(clearTimeout); startGame() }
$('#bTitle').onclick = () => { Snd.sfx('tap'); revealTimers.forEach(clearTimeout); goTitle() }
$('#bSave').onclick = () => { Snd.sfx('tap'); saveImage() }
$('#bPause').onclick = () => pauseGame(true)
$('#bResume').onclick = () => pauseGame(false)
$('#bQuit').onclick = () => { S.view = 'title'; goTitle() }
$('#bMute').onclick = () => { S.muted = !S.muted; store.set('mute', S.muted ? '1' : '0'); applyMute() }
$('#bLang').onclick = () => { S.lang = S.lang === 'ja' ? 'en' : 'ja'; store.set('lang', S.lang); H.last = {}; applyLang() }
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(true) })
canvas.addEventListener('pointerdown', e => { if (S.view === 'play') { e.preventDefault(); grab() } })
$('#vPlay').addEventListener('pointerdown', e => { if (!e.target.closest('button')) grab() })
addEventListener('keydown', e => {
  if (S.view === 'play' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); if (!e.repeat) grab() }
  else if (S.view === 'play' && (e.key === 'p' || e.key === 'P' || e.key === 'Escape')) pauseGame(true)
  else if (S.view === 'pause' && (e.key === 'p' || e.key === 'P' || e.key === 'Escape')) pauseGame(false)
  else if (S.view === 'title' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); startGame() }
})

// ---------- ループ
function resize() {
  const W = innerWidth, Hh = innerHeight
  renderer.setSize(W, Hh, false); camera.aspect = W / Hh; camera.fov = W / Hh < 0.8 ? 52 : 44; camera.updateProjectionMatrix(); measureResult()
}
addEventListener('resize', resize)
let acc = 0, last = performance.now(), frames = 0, lastView = ''
function frame() {
  requestAnimationFrame(frame)
  const now = performance.now(); let d = (now - last) / 1000; last = now; if (d > 0.25) d = 0.25
  if (!S.dbgPause && S.view !== 'pause') { acc += d; let n = 0; while (acc >= DT && n < 8) { step(); acc -= DT; n++ } if (n === 8) acc = 0 }
  render()
}
function render() {
  if (lastView !== S.view) { lastView = S.view; resize() }
  Snd.tick(); hud(); placeBubbles(); if (S.view === 'result') measureResult()
  renderer.render(scene, camera); frames++
}

// ---------- 検証用の窓口
window.st = {
  S, D, TUNE, renderer, camera, scene, me, chef, staff, nb,
  start: seed => startGame(seed), title: goTitle, finish, grab, saveImage, makeCard, fillResult, computeResult, stability, topX, topY,
  setBot: b => { S.bot = b },
  // 種とボットを決めて最後まで一気に回す（分布と再現性の検証）
  simulate(seed, bot) {
    S.fast = true; startGame(seed); S.bot = bot; let n = 0
    while (S.view === 'play' && n < 60 * 60) { step(); n++ }
    S.bot = null; S.fast = false; const r = { ...S.result, steps: n }
    return r
  },
  force: {
    collapse: dir => collapse(dir || 1), ceil: () => reachCeil(), tears: () => { S.tears = 3; setFace(me, 'tears', 3) },
    stack(types, offs) { for (let i = 0; i < types.length; i++) { const m = makePlate(types[i], false); towerG.add(m); const prev = S.tower[S.tower.length - 1]; S.tower.push({ type: types[i], X: (prev ? prev.X : 0) + (offs ? offs[i] || 0 : 0), r: PT[types[i]].r, m: PT[types[i]].m, mesh: m }); S.eaten[types[i]] = (S.eaten[types[i]] || 0) + 1 } },
    time: t => { S.t = t }, phase: p => { S.phase = p }, sway: (q, qv) => { S.sway.q = q; S.sway.qv = qv || 0 }, event: (type, dt = 0) => { S.events.push({ type, t: S.t + dt + (type === 'boat' ? 1.8 : 1.1), dir: 1 }) },
    plateAt: (type, dx) => { const o = spawnPlate(topX() + (dx || 0), S.rng, type); o.mesh.userData.forced = 1; return o.type },
  },
  dbg: { pause(b = true) { S.dbgPause = b; if (!b) { last = performance.now(); acc = 0 } }, step(n = 1) { for (let i = 0; i < n; i++) step() }, render() { render() } },
  fps: () => new Promise(res => { const f0 = frames, t0 = performance.now(); setTimeout(() => res(Math.round((frames - f0) / ((performance.now() - t0) / 1000))), 2000) }),
}
applyLang(); applyMute(); resize(); goTitle(); stepCamera()
requestAnimationFrame(frame)
window.__stReady = true
