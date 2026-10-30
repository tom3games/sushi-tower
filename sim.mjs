// ボットで結果の分布を測る。node sim.mjs [回数]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '0' } })
const port = await new Promise(r => server.stdout.on('data', d => { const m = String(d).match(/:(\d+)/); if (m) r(m[1]) }))
const N = +(process.argv[2] || 40)
const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 390, height: 844 }, locale: 'ja-JP' })
await p.goto(`http://localhost:${port}/`); await p.waitForFunction(() => window.__stReady)
const K = process.argv[3], SEED0 = +(process.argv[4] || 1000)
const out = await p.evaluate(([N, K, SEED0]) => {
  if (K) st.TUNE.swayK = +K
  st.dbg.pause(true); const res = {}
  for (const bot of ['good', 'normal', 'sloppy', 'none']) {
    const tiers = {}, cnt = [], col = []; let bill = 0
    for (let i = 0; i < N; i++) { const r = st.simulate(SEED0 + i, bot); tiers[r.tier] = (tiers[r.tier] || 0) + 1; cnt.push(r.count); col.push(r.collapsed ? 1 : 0); bill += r.total }
    cnt.sort((a, b) => a - b)
    res[bot] = { tiers, median: cnt[N >> 1], max: cnt[N - 1], collapseRate: col.reduce((a, b) => a + b) / N, avgBill: Math.round(bill / N) }
  }
  return res
}, [N, K, SEED0])
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(7), JSON.stringify(v))
await b.close(); server.kill()
