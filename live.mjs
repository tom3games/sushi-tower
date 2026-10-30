// 公開URLの確認。node live.mjs（ログインしていないブラウザで見る）。SKIPGH=1 で GitHub ページの確認を省く
// sushi-tower __st を置き換え、「遊びの通し」をゲームに合わせて書く
import { chromium, webkit } from 'playwright'
const URL0 = 'https://tom3games.github.io/sushi-tower/'
const out = []
for (const [name, bt, opts] of [['chromium', chromium, {}], ['webkit', webkit, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await bt.launch(), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts }), p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('requestfailed', r => errs.push('fail ' + r.url()))
  await p.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__stReady, null, { timeout: 15000 })
  // 遊びの通し: タップで開始 → 1枚取る → 結果まで早送り
  if (name === 'webkit') await p.tap('#bStart'); else await p.click('#bStart')
  await p.waitForTimeout(1300)
  await p.evaluate(() => { for (const o of st.S.lane) o.x = 9.5; st.force.plateAt('white', 0); st.grab() })
  await p.waitForTimeout(900)
  const n = await p.evaluate(() => st.S.tower.length)
  await p.evaluate(() => { st.dbg.pause(true); st.force.time(44.95); st.dbg.step(150); st.dbg.pause(false) })
  await p.waitForTimeout(5500)
  const view = await p.evaluate(() => st.S.view); if (n !== 1 || view !== 'result') errs.push('flow n=' + n + ' view=' + view)
  await p.screenshot({ path: `shots/live-${name}.png` })
  const og = await p.evaluate(async () => { const r = await fetch(document.querySelector('meta[property="og:image"]').content); return r.status + ' ' + r.headers.get('content-type') })
  out.push(`${name}: og=${og} errors=${errs.length ? errs.join(' | ') : 'none'}`)
  await b.close()
}
if (process.env.SKIPGH) { console.log(out.join('\n')); process.exit(0) }
// ログアウト状態でリポジトリ・更新履歴に個人のIDが出ていないか
const b = await chromium.launch(), p = await b.newPage()
for (const u of ['https://github.com/tom3games/sushi-tower', 'https://github.com/tom3games/sushi-tower/commits/main']) {
  const res = await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  out.push(`${u} status=${res.status()} personalId=${new RegExp(['tmk', '4men'].join(''), 'i').test(await p.content()) ? 'FOUND' : 'none'}`)
}
await b.close()
console.log(out.join('\n'))
