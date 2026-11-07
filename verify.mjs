// 自分で壊す検証。node verify.mjs（全部 pass で 0 終了）。サーバーは空いているポートを自動で取る
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '0' } })
const PORT = await new Promise(r => server.stdout.on('data', d => { const m = String(d).match(/:(\d+)/); if (m) r(m[1]) }))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${String(e.message).split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)) }
async function open(browser, opts = {}, init) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, acceptDownloads: true, ...opts })
  await ctx.addInitScript(init || (() => { try { localStorage.clear() } catch (e) {} }))
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0); await p.waitForFunction(() => window.__stReady, null, { timeout: 30000 })
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *, #corner *')) {
    if (el.closest('[hidden]') || el.closest('#fx') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  const vis = el => el.offsetParent && !el.closest('[hidden]')
  for (const el of document.querySelectorAll('main:not([hidden]) button, #corner button')) { if (!vis(el)) continue; const r = el.getBoundingClientRect(); if (r.bottom > H + 1 || r.top < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  for (const el of document.querySelectorAll('main:not([hidden]) .howCard, main:not([hidden]) .receipt, main:not([hidden]) .rWrap, main:not([hidden]) .logo, main:not([hidden]) .hud')) { const r = el.getBoundingClientRect(); if (r.bottom > H + 1 || r.top < -1) over.push(el.className + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  // ボタン同士・HUD と右上ボタンが重ならない
  const bs = [...document.querySelectorAll('main:not([hidden]) button, #corner button, main:not([hidden]) .hud')].filter(vis).map(b => [b.id || b.className, b.getBoundingClientRect()])
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i][1], b = bs[j][1]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) over.push('overlap ' + bs[i][0] + '/' + bs[j][0]) }
  // 中身が箱からあふれていない（レシート・遊び方）
  for (const el of document.querySelectorAll('main:not([hidden]) .receipt, main:not([hidden]) .howList')) if (el.scrollHeight > el.clientHeight + 2) over.push('clip ' + el.className + ' ' + el.scrollHeight + '>' + el.clientHeight)
  return { H, over: over.slice(0, 6) }
})
const glVariance = p => p.evaluate(() => {
  st.dbg.render(); const src = document.querySelector('#gl'), c = document.createElement('canvas'); c.width = 200; c.height = 200
  const x = c.getContext('2d'); x.drawImage(src, 0, 0, 200, 200); const d = x.getImageData(0, 0, 200, 200).data
  let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 7) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ }
  return Math.round(s2 / n - (s / n) ** 2)
})
// 結果画面を即座に作る（演出の待ち時間を飛ばす）
const toResult = (q, js) => q.evaluate(js => { st.dbg.pause(true); eval(js); st.finish(); st.fillResult(true) }, js)
// ---- Xでポスト の検査道具
// window.open をスタブして押す → 開いたURLを分解して確かめる
const xStub = async (pg, ns, pub, tag) => {
  await pg.evaluate(() => { window.__opened = []; if (!window.__origOpen) window.__origOpen = window.open; window.open = (...a) => { window.__opened.push(a); return null } })
  const vis = await pg.evaluate(() => { const b = document.querySelector('#bX'), r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, clip: b.scrollWidth > b.clientWidth + 1, bg: getComputedStyle(b).backgroundColor, label: b.textContent.trim(), svg: !!b.querySelector('svg path') } })
  await pg.click('#bX')
  const r = await pg.evaluate(ns => ({ opened: window.__opened, text: window[ns].xText(), url: window[ns].xUrl() }), ns)
  await pg.evaluate(() => { window.open = window.__origOpen })
  expect(r.opened.length === 1, r)
  const [u, target, feat] = r.opened[0], q = new URL(u)
  const text = q.searchParams.get('text'), url = q.searchParams.get('url')
  expect(u.startsWith('https://x.com/intent/post?') && target === '_blank' && /noopener/.test(feat || '') && u === r.url, r.opened[0])
  expect(text === r.text && text.includes(tag) && (text.match(/#/g) || []).length === 1 && url === pub && !/https?:\/\//.test(text), { text, url })
  expect(vis.inView && !vis.clip && vis.svg && vis.bg === 'rgb(0, 0, 0)' && vis.h >= 36, vis)
  return { label: vis.label, text }
}
// 本物のクリックで新しいタブ（popup）が開く。x.com へは出ずにダミーを返す
const xPopup = async (pg, pub) => {
  await pg.context().route(/^https:\/\/x\.com\//, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>x</title>ok' }))
  const [pop] = await Promise.all([pg.waitForEvent('popup', { timeout: 8000 }), pg.click('#bX')])
  await pop.waitForLoadState().catch(() => {})
  const u = new URL(pop.url()); await pop.close()
  expect(u.origin + u.pathname === 'https://x.com/intent/post' && u.searchParams.get('url') === pub && u.searchParams.get('text'), pop.url())
  return u.searchParams.get('text')
}
// 結果画面のボタンの文字が切れていない
const btnClip = pg => pg.evaluate(() => [...document.querySelectorAll('#vResult button')].filter(b => b.offsetParent && b.scrollWidth > b.clientWidth + 1).map(b => b.id + ':' + b.scrollWidth + '>' + b.clientWidth))
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [844, 390, 'land'], [667, 375, 'land-se'], [768, 1024, 'tab'], [1440, 900, 'pc']]
const GPU = { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }

const browser = await chromium.launch(GPU)
const p = await open(browser)
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', r)
})
await t('OGP 一式がある（og:image は ?v= 付きの公開URL）', async () => {
  const r = await p.evaluate(() => Object.fromEntries(['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => [k, document.querySelector(`meta[property="${k}"]`)?.content]).concat([['tw', document.querySelector('meta[name="twitter:card"]')?.content]])))
  expect(Object.values(r).every(Boolean) && r['og:image'] === 'https://tom3games.github.io/sushi-tower/og.png?v=1' && r['og:url'] === 'https://tom3games.github.io/sushi-tower/' && r.tw === 'summary_large_image', r)
})
await t('3D の店が描けている（輝度の散らばり）', async () => { const v = await glVariance(p); expect(v > 300, v); return v })
await t('タイトル → 遊び方 → もどる → 遊び方からスタート', async () => {
  await p.click('#bHow'); expect(await p.isVisible('#vHow'), 'how')
  const ctrl = await p.textContent('#ctrlLine'); expect(/クリック|スペース/.test(ctrl), ctrl)
  await p.click('#bHowBack'); expect(await p.isVisible('#vTitle'), 'title')
  await p.click('#bHow'); await p.click('#bHowGo'); expect(await p.isVisible('#vPlay'), 'play')
  const r = await p.evaluate(() => ({ view: st.S.view, phase: st.S.phase, lane: st.S.lane.length })); expect(r.view === 'play' && r.lane > 4, r); return r
})
await t('リアルタイムで時計が進む（固定60Hz・実時間と一致）', async () => {
  const r = await p.evaluate(async () => { const t0 = st.S.t + (st.S.phase === 'ready' ? -0.9 + st.S.phT : 0), w0 = performance.now(); await new Promise(r => setTimeout(r, 2500)); return { game: st.S.t - t0, real: (performance.now() - w0) / 1000 } })
  expect(Math.abs(r.game - r.real) < 0.35, r); return r
})
await t('皿を取ると食べて（もぐもぐ）タワーに積まれる', async () => {
  const r = await p.evaluate(() => {
    st.dbg.pause(true); st.start(42); st.dbg.step(60); for (const o of st.S.lane) o.x = 9.5
    st.force.plateAt('white', 0.01); const ok = st.grab(); const busy = st.S.busy; st.dbg.step(16); const chew = st.me.face.material.map === st.me.face.material.map; st.dbg.step(30)
    return { ok, busy, n: st.S.tower.length, eaten: st.S.eaten, bill: document.querySelector('#hBill').textContent }
  })
  expect(r.ok && r.busy > 0.4 && r.n === 1, r); return r
})
await t('真上に載せると「ピタッ」・連続でコンボ', async () => {
  const r = await p.evaluate(() => {
    st.dbg.pause(true); st.start(43); st.dbg.step(60); for (const o of st.S.lane) o.x = 9.5
    st.force.stack(['white', 'white'])
    for (let i = 0; i < 3; i++) { st.S.sway.A = 0; st.S.sway.q = 0; const before = st.S.lane.length; st.force.plateAt('blue', 0.01); st.grab(); st.dbg.step(35) }
    const t = st.S.tower; return { n: t.length, perfects: st.S.perfects, combo: st.S.combo, sameX: t.slice(1).every(p => Math.abs(p.X - t[0].X) < 1e-9) }
  })
  expect(r.n === 5 && r.perfects === 3 && r.combo === 3 && r.sameX, r); return r
})
await t('ずれすぎると皿がすべり落ちて割れ、弁償に数えられる', async () => {
  const r = await p.evaluate(() => {
    st.dbg.pause(true); st.start(44); st.dbg.step(60); for (const o of st.S.lane) o.x = 9.5
    st.force.stack(['white', 'white']); st.S.sway.A = 0
    st.force.plateAt('red', 0.5); st.grab(); st.dbg.step(35); const mid = { n: st.S.tower.length, slips: st.S.slips, debris: st.S.debris.length }
    st.dbg.step(120); return { ...mid, shards: st.S.shards.length, broken: st.computeResult().broken }
  })
  expect(r.n === 2 && r.slips === 1 && r.shards > 0 && r.broken === 1, r); return r
})
await t('近くに皿が無いと空振り（スカッ）で少し待たされる', async () => {
  const r = await p.evaluate(() => { st.dbg.pause(true); st.start(45); st.dbg.step(60); for (const o of st.S.lane) o.x = 9.5; const ok = st.grab(); const again = st.grab(); return { ok, again, busy: st.S.busy, n: st.S.tower.length } })
  expect(!r.ok && !r.again && r.busy > 0.2 && r.n === 0, r); return r
})
await t('わさびを食べると涙で狙いがぶれる', async () => {
  const r = await p.evaluate(() => {
    st.dbg.pause(true); st.start(46); st.dbg.step(60); for (const o of st.S.lane) o.x = 9.5
    st.force.stack(['white', 'white']); st.S.sway.A = 0
    st.force.plateAt('wasabi', 0); st.grab(); st.dbg.step(35); const tears = st.S.tears
    const Xs = []; for (let i = 0; i < 4; i++) { st.S.sway.A = 0; st.S.sway.q = 0; st.S.sway.qv = 0; st.force.plateAt('white', 0); st.grab(); st.dbg.step(32) }
    const t = st.S.tower; return { tears, n: t.length, perfects: st.S.perfects, spread: Math.max(...t.map(p => p.X)) - Math.min(...t.map(p => p.X)), tearsOn: document.querySelector('#tears').className }
  })
  expect(r.tears > 2 && r.perfects < 4 && r.spread > 0.05, r); return r
})
await t('傾きすぎると崩壊 → 店員と板前が「お客様ーっ！」→ 結果に弁償', async () => {
  const r = await p.evaluate(async () => {
    st.dbg.pause(true); st.start(47); st.dbg.step(60); for (const o of st.S.lane) o.x = 9.5
    st.force.stack(['white', 'blue', 'red', 'gold', 'gold', 'black'], [0, 0.2, 0.2, 0.2, 0.2, 0.2]); st.dbg.step(20)
    const phase = st.S.phase; st.dbg.step(80); st.dbg.render()
    const bubbles = [...document.querySelectorAll('#fx .bub')].map(b => b.textContent)
    st.dbg.step(150); return { phase, view: st.S.view, bubbles, R: st.S.result }
  })
  expect(r.phase === 'collapse' && r.view === 'result' && r.R.collapsed && r.R.count === 6 && r.R.broken === 6 && r.R.fee === 3000 && r.bubbles.some(b => /お客様/.test(b)), r)
  return { bubbles: r.bubbles, tier: r.R.tier, total: r.R.total }
})
await t('天井まで積むと天井到達 → 称号は「回転寿司の塔主」', async () => {
  const r = await p.evaluate(() => {
    st.dbg.pause(true); st.start(48); st.dbg.step(60); for (const o of st.S.lane) o.x = 9.5
    st.force.stack(Array(st.D.CEIL - 1).fill('white')); st.S.sway.A = 0; st.S.sway.q = 0
    st.force.plateAt('white', 0); st.grab(); st.dbg.step(35); const ph = st.S.phase; st.dbg.step(200)
    return { ph, view: st.S.view, R: st.S.result }
  })
  expect(r.ph === 'ceil' && r.view === 'result' && r.R.ceil && r.R.tier === 'lord' && r.R.count === 34, r); return { count: r.R.count, total: r.R.total }
})
await t('45秒で「おあいそ」→ 結果。称号はハンコが押されるまで見せない', async () => {
  const r = await p.evaluate(async () => {
    st.dbg.pause(true); st.start(49); st.dbg.step(60); for (const o of st.S.lane) o.x = 9.5
    st.force.stack(['white', 'blue', 'white', 'red', 'white', 'blue', 'white', 'blue']); st.S.events = []; st.force.time(44.9); st.S.sway.A = 0
    st.dbg.step(30); const ph = st.S.phase; st.dbg.step(120); st.dbg.render()
    const hidden0 = getComputedStyle(document.querySelector('#rStamp')).visibility
    await new Promise(r => setTimeout(r, 5200))
    return { ph, view: st.S.view, hidden0, after: getComputedStyle(document.querySelector('#rStamp')).visibility, stamp: document.querySelector('#rStamp').textContent, tier: st.S.result.tier, lines: document.querySelectorAll('#rcLines .rcL').length, total: document.querySelector('#rcTotal').textContent }
  })
  expect(r.ph === 'end' && r.view === 'result' && r.hidden0 === 'hidden' && r.after === 'visible' && r.tier === 'normal' && /ふつうのお客様/.test(r.stamp) && r.lines === 3, r); return r
})
await t('お会計の計算が合う（皿の値段＋弁償＋税）', async () => {
  const r = await p.evaluate(() => { const R = st.computeResult(); const s = R.lines.reduce((a, l) => a + l.q * l.price, 0) + R.broken * st.D.BREAK_FEE; return { R, s, ok: R.sub === s && R.tax === Math.floor(s * 0.1) && R.total === s + R.tax } })
  expect(r.ok, r)
})
await t('隣の客の肘で揺れる・高いタワーは舟盛りにぶつかる', async () => {
  const r = await p.evaluate(() => {
    st.dbg.pause(true); st.start(50); st.dbg.step(60); for (const o of st.S.lane) o.x = 9.5; st.S.events = []
    st.S.sway.q = 0; st.S.sway.qv = 0; st.force.event('elbow'); st.dbg.step(75); const elbow = Math.abs(st.S.sway.qv) + Math.abs(st.S.sway.q)
    st.force.stack(Array(16).fill('white')); st.S.sway.q = 0; st.S.sway.qv = 0; st.S.sway.A = 0
    st.force.event('boat'); let hit = false; for (let i = 0; i < 200 && !hit; i++) { st.dbg.step(1); hit = st.S.events.some(e => e.type === 'boat' && e.hitDone) }
    return { elbow, hit, qv: st.S.sway.qv, boatVisible: true }
  })
  expect(r.elbow > 0.05 && r.hit && r.qv < -0.5, r); return r
})
await t('同じ種・同じ操作なら同じ結果（再現性）', async () => {
  const r = await p.evaluate(() => { const a = st.simulate(777, 'normal'), b = st.simulate(777, 'normal'), c = st.simulate(778, 'normal'); return { a: [a.count, a.total, a.tier], b: [b.count, b.total, b.tier], c: [c.count, c.total] } })
  expect(JSON.stringify(r.a) === JSON.stringify(r.b) && r.a[0] > 0, r); return r
})
await t('難しさの分布（上手い=上位がたまに / ふつう=中間 / 雑=下位 / 何もしない=お茶）', async () => {
  const r = await p.evaluate(() => {
    const N = 30, out = {}
    for (const bot of ['good', 'normal', 'sloppy', 'none']) { const c = {}; for (let i = 0; i < N; i++) { const x = st.simulate(5000 + i, bot); c[x.tier] = (c[x.tier] || 0) + 1 } out[bot] = c }
    return out
  })
  const g = r.good, n = r.normal, s = r.sloppy
  expect((g.lord || 0) >= 3 && (g.lord || 0) <= 20 && ((g.lord || 0) + (g.master || 0)) >= 15, 'good ' + JSON.stringify(g))
  expect(((n.normal || 0) + (n.regular || 0)) >= 15 && (n.lord || 0) <= 2, 'normal ' + JSON.stringify(n))
  expect((s.breaker || 0) >= 15 && !s.lord && !s.master, 'sloppy ' + JSON.stringify(s))
  expect(r.none.tea === 30, 'none ' + JSON.stringify(r.none))
  return r
})
await t('スペースキーで取れる・P で一時停止と再開', async () => {
  const r = await p.evaluate(() => { st.dbg.pause(false); st.start(51); return 1 })
  await p.waitForTimeout(1200)
  await p.evaluate(() => { for (const o of st.S.lane) o.x = 9.5; st.force.plateAt('white', 0) })
  await p.keyboard.press('Space'); const busy = await p.evaluate(() => st.S.busy)
  await p.keyboard.press('p'); const paused = await p.evaluate(() => st.S.view); const t1 = await p.evaluate(() => st.S.t); await p.waitForTimeout(500); const t2 = await p.evaluate(() => st.S.t)
  await p.keyboard.press('p'); const back = await p.evaluate(() => st.S.view)
  expect(busy > 0 && paused === 'pause' && t1 === t2 && back === 'play', { busy, paused, t1, t2, back }); return { busy, paused, back }
})
await t('音を全部鳴らしてもエラーが出ない（曲・効果音・声）', async () => {
  const r = await p.evaluate(async () => {
    Snd.init(); for (const tr of ['title', 'play', 'result', 'sad']) { Snd.setTrack(tr); await new Promise(r => setTimeout(r, 380)); Snd.tick() }
    for (const n of ['tap', 'grab', 'chew', 'clink', 'perfect', 'whiff', 'slip', 'smash', 'crash', 'wobble', 'wasabi', 'elbow', 'boat', 'warn', 'bell', 'go', 'print', 'register', 'drum', 'stamp', 'cheer', 'ceiling', 'boo', 'eek', 'ah', 'yum', 'okyaku']) Snd.sfx(n)
    await new Promise(r => setTimeout(r, 300)); return { state: Snd.ctx && Snd.ctx.state, played: Object.keys(Snd.played).length, level: Snd.level() }
  })
  expect(r.played >= 27 && p.errs.length === 0, { r, errs: p.errs }); return r
})
await t('ミュートで音量0・状態が残る', async () => {
  await p.evaluate(() => { st.dbg.pause(true); st.title() }); await p.click('#bMute')
  const r = await p.evaluate(() => ({ g: Snd.master && Snd.master.gain.value, ls: localStorage.getItem('st.mute') })); await p.click('#bMute')
  expect(r.g === 0 && r.ls === '1', r)
})
await t('結果を1枚の画像（1080x1350）にして保存できる', async () => {
  await toResult(p, "st.start(52); st.dbg.step(60); st.force.stack(['white','blue','red','gold','black','white','blue','red','white','blue','white','red','gold']); st.S.slips = 1")
  const card = await p.evaluate(async () => { const c = await st.makeCard(); const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ } const url = c.toDataURL('image/png'); return { w: c.width, h: c.height, v: Math.round(s2 / n - (s / n) ** 2), url } })
  const b64 = card.url.split(',')[1]; const { writeFileSync } = await import('node:fs'); writeFileSync(ROOT + '/shots/card-ja.png', Buffer.from(b64, 'base64'))
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.click('#bSave')])
  expect(card.w === 1080 && card.h === 1350 && card.v > 500 && dl.suggestedFilename() === 'sushi-tower.png', { w: card.w, h: card.h, v: card.v }); return { v: card.v, file: dl.suggestedFilename() }
})
const PUB = 'https://tom3games.github.io/sushi-tower/'
await t('Xでポスト: 日本語（ボタンが見える・x.com/intent/post・本文に称号と枚数とハッシュタグ・url=公開URL）', async () => {
  await p.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('on')))
  const r = await xStub(p, 'st', PUB, '#回転寿司の皿タワー')
  const stamp = await p.evaluate(() => document.querySelector('#rStamp').lastChild.textContent)
  const n = await p.evaluate(() => st.S.result.count)
  expect(r.label === 'Xでポスト' && r.text.includes(stamp) && r.text.includes(n + '枚'), { r, stamp }); return r.text
})
await t('Xでポスト: 本物のクリックで新しいタブが開く', async () => { const tx = await xPopup(p, PUB); expect(/#回転寿司の皿タワー/.test(tx), tx); return tx.length })
await t('Xでポスト: 英語', async () => {
  await p.click('#bLang')
  const r = await xStub(p, 'st', PUB, '#SushiPlateTower')
  const stamp = await p.evaluate(() => document.querySelector('#rStamp').lastChild.textContent)
  await p.screenshot({ path: ROOT + '/shots/result-en-x.png' })
  await p.click('#bLang')
  expect(r.label === 'Post on X' && r.text.includes(stamp) && !/[ぁ-んァ-ン一-龥]/.test(r.text), { r, stamp }); return r.text
})
await t('英語に切り替えると全画面が英語（結果・画像も）', async () => {
  await p.click('#bLang')
  const r = await p.evaluate(async () => {
    const res = { stamp: document.querySelector('#rStamp').textContent, total: document.querySelector('[data-t=receiptTotal]').textContent, again: document.querySelector('#bAgain').textContent }
    const c = await st.makeCard(); const url = c.toDataURL('image/png'); st.title()
    return { ...res, l2: document.querySelector('[data-t=title2]').textContent, start: document.querySelector('#bStart').textContent, lang: document.documentElement.lang, url, jp: /[ぁ-んァ-ン一-龥]/.test(document.querySelector('#vTitle').textContent) }
  })
  const { writeFileSync } = await import('node:fs'); writeFileSync(ROOT + '/shots/card-en.png', Buffer.from(r.url.split(',')[1], 'base64'))
  expect(r.l2 === 'PLATE TOWER' && r.lang === 'en' && !r.jp && r.total === 'TOTAL' && /Play again/.test(r.again) && /Legendary|Customer|Master|Lord|Tea|God/.test(r.stamp), r)
  await p.screenshot({ path: ROOT + '/shots/en-title.png' }); await p.click('#bLang')
  return { stamp: r.stamp, l2: r.l2 }
})
await t('fps（GPU 有効のヘッドレス Chromium・プレイ中）', async () => {
  await p.evaluate(() => { st.dbg.pause(false); st.start(53); st.setBot('normal') })
  await p.waitForTimeout(1500); const f = await p.evaluate(() => st.fps()); await p.evaluate(() => st.setBot(null))
  expect(f >= 40, f); return f
})
await t('全体でエラーが出ていない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await p.close()

// ---- 6サイズ × 全画面で一画面に収まる（日英・崩壊/天井/お茶の結果も）
for (const [w, h, name] of SIZES) {
  const q = await open(browser, { viewport: { width: w, height: h } })
  const views = {}
  await q.evaluate(() => st.dbg.pause(true))
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await q.click('#bHow'); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-how.png` })
  await q.click('#bHowGo')
  await q.evaluate(() => { st.dbg.pause(true); st.S.fast = true; st.force.stack(['white', 'blue', 'red', 'white', 'gold', 'blue', 'white', 'red', 'white', 'blue', 'white', 'red']); st.S.combo = 3; st.S.warn = { txt: st.D.TXT.ja.warnBoat, until: 99 }; st.S.tutOn = true; st.S.fast = false; st.dbg.step(70); st.dbg.render() })
  views.play = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-play.png` })
  await q.evaluate(() => { st.S.view = 'play' }); await q.keyboard.press('p'); views.pause = await fit(q); await q.keyboard.press('p')
  await toResult(q, "st.S.fast=true; st.force.collapse(1); st.S.fast=false; st.dbg.step(200)"); await q.evaluate(() => { st.S.collapseN = 9; st.S.result = st.computeResult(); st.fillResult(true); st.dbg.step(90); st.dbg.render() })
  views.crash = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result-crash.png` })
  await toResult(q, "st.start(9); st.dbg.step(60); st.force.stack(Array(st.D.CEIL).fill('white').map((x,i)=>['white','blue','red','gold','black'][i%5])); st.S.ceil = true; st.S.slips = 2")
  await q.evaluate(() => { st.dbg.step(90); st.dbg.render() })
  views.ceil = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result-ceil.png` })
  { const c = await btnClip(q); await t(`${name}: 結果画面のボタンの文字が切れない（日本語）`, async () => { expect(!c.length, c) }) }
  await q.click('#bLang'); await toResult(q, 'st.start(10); st.dbg.step(30)'); await q.evaluate(() => { st.dbg.step(60); st.dbg.render() })
  views.teaEn = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result-tea-en.png` })
  { const c = await btnClip(q); await t(`${name}: 結果画面のボタンの文字が切れない（英語）`, async () => { expect(!c.length, c) }) }
  await q.evaluate(() => st.title()); views.titleEn = await fit(q)
  await q.click('#bLang')
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, r) })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await q.close()
}
await browser.close()

// ---- WebKit（iPhone 相当）でタッチの通し
const wb = await webkit.launch()
for (const [w, h, name] of [[390, 844, 'p'], [844, 390, 'l']]) {
  const wp = await open(wb, { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await t(`WebKit ${name}: 2本指の touchmove を止める`, async () => {
    const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
    expect(r, r)
  })
  await t(`WebKit ${name}: タップで始めて、画面タップで皿が取れる`, async () => {
    await wp.tap('#bStart'); await wp.waitForTimeout(1300)
    const ctrl = await wp.evaluate(() => document.querySelector('#tutTxt').textContent)
    await wp.evaluate(() => { for (const o of st.S.lane) o.x = 9.5; st.force.plateAt('white', 0) })
    await wp.touchscreen.tap(w / 2, h * 0.6); await wp.waitForTimeout(900)
    const r = await wp.evaluate(() => ({ n: st.S.tower.length, view: st.S.view })); await wp.screenshot({ path: `${ROOT}/shots/webkit-${name}.png` })
    expect(r.n === 1 && /タップ/.test(ctrl), { r, ctrl }); return r
  })
  await t(`WebKit ${name}: 3D が描けている`, async () => { const v = await glVariance(wp); expect(v > 300, v); return v })
  await t(`WebKit ${name}: エラーなし`, async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
  await wp.close()
}
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
