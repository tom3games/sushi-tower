// SNS用サムネ og.png（1200x630）。皿タワーが崩れて宙を舞う瞬間＋「お客様ーっ！」＋タイトル。node og.mjs
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '0' } })
const port = await new Promise(r => server.stdout.on('data', d => { const m = String(d).match(/:(\d+)/); if (m) r(m[1]) }))
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, locale: 'ja-JP' })
await p.addInitScript(() => { try { localStorage.setItem('st.tut', '1') } catch (e) {} })
await p.goto(`http://localhost:${port}/`); await p.waitForFunction(() => window.__stReady)
await p.evaluate(() => Promise.all(['60px "Dela Gothic One"', '900 30px "M PLUS Rounded 1c"'].map(f => document.fonts.load(f))))
await p.evaluate(() => {
  st.dbg.pause(true); st.start(31); st.dbg.step(60); st.S.events = []
  const seq = ['white', 'blue', 'red', 'white', 'gold', 'blue', 'white', 'red', 'black', 'blue', 'white', 'gold', 'red', 'blue', 'white', 'red', 'gold', 'white', 'blue', 'black', 'red', 'white', 'gold', 'blue']
  st.force.stack(seq, seq.map((_, i) => i > 14 ? 0.035 : (i % 3 - 1) * 0.02)); st.S.sway.A = 0; st.S.sway.q = 0
  st.dbg.step(2)
  st.force.collapse(1); st.dbg.step(17)
})
// カメラを左前から。右側に文字を置く余白
await p.evaluate(() => {
  const c = st.camera; c.clearViewOffset && c.clearViewOffset()
  st.S.shake = 0
  const step = () => { c.position.set(2.0, 2.95, 6.3); c.lookAt(1.45, 2.55, -1.1); c.updateMatrixWorld() }
  step(); st.dbg.render(); step(); st.dbg.render()
})
await p.addStyleTag({ content: `#corner,.hud,#msg,#warn,#tut,.ono{display:none!important}
  body::after{content:'';position:fixed;inset:0 0 0 50%;background:linear-gradient(90deg,rgba(42,23,18,0),rgba(42,23,18,.93) 26%);z-index:30;pointer-events:none}` })
await p.evaluate(() => {
  // 吹き出しは手で置く（演出のタイミングに依存しない）
  const fx = document.querySelector('#fx'); fx.innerHTML = ''
  const bub = (txt, x, y, shout) => { const d = document.createElement('div'); d.className = 'bub' + (shout ? ' shout' : ''); d.textContent = txt; d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.animation = 'none'; d.style.zIndex = 40; fx.appendChild(d) }
  bub('お客様ーっ！！', 140, 250, true); bub('ひぃぃ…', 390, 290)
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;right:34px;top:0;bottom:0;width:520px;z-index:31;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:18px;color:#fff;text-align:center'
  d.innerHTML = `<div style="font-family:'Dela Gothic One';font-size:40px;color:#1d1410;background:#f1dcb4;padding:4px 18px 8px;border-radius:8px;box-shadow:0 5px 0 #a88a5a;transform:rotate(-2deg)">回転寿司の</div>
  <div style="font-family:'Dela Gothic One';font-size:124px;line-height:1;-webkit-text-stroke:3px #8f1d1a;paint-order:stroke fill;text-shadow:0 7px 0 #8f1d1a,0 12px 0 rgba(0,0,0,.35),0 0 30px rgba(216,58,52,.6);transform:rotate(-2deg)">皿タワー</div>
  <div style="font-weight:900;font-size:31px;font-family:'M PLUS Rounded 1c';line-height:1.5;margin-top:6px">食べた皿を、天井まで積み上げろ。<br><span style="color:#f2c14e">お会計は見ないふりで。</span></div>`
  document.body.appendChild(d)
})
await p.waitForTimeout(300)
await p.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
console.log('ok')
