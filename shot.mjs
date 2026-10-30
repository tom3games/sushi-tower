// 手元確認用の撮影。node shot.mjs <name> <w> <h> <js>
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname; mkdirSync(ROOT + '/shots', { recursive: true })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '0' } })
const port = await new Promise(r => server.stdout.on('data', d => { const m = String(d).match(/:(\d+)/); if (m) r(m[1]) }))
const [name = 'probe', w = 390, h = 844, js = ''] = process.argv.slice(2)
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: +w, height: +h }, locale: 'ja-JP' })
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${port}/`); await p.waitForFunction(() => window.__stReady, null, { timeout: 15000 }).catch(e => errs.push('notReady'))
await p.waitForTimeout(600)
if (js) console.log(JSON.stringify(await p.evaluate(js)))
await p.waitForTimeout(300)
await p.screenshot({ path: `${ROOT}/shots/${name}.png` })
console.log('errs', errs.join(' | ') || 'none')
await b.close(); server.kill()
