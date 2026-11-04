const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const b = await chromium.launch();
 for (const n of process.argv.slice(2)) {
  const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', n, e.message)); p.on('console', m => { if (m.type() === 'error') console.log('CERR', n, m.text().slice(0, 200)); });
  const t = Date.now();
  await p.goto('http://localhost:8765/convert2.html?only=' + n); await p.waitForFunction(() => window.DONE, null, { timeout: 280000 }).catch(e => console.log('TIMEOUT', n));
  const b64 = await p.evaluate(n => window.OUT[n], n);
  if (b64) { fs.writeFileSync('out/' + n + '.glb', Buffer.from(b64, 'base64')); console.log(n, 'ok', JSON.stringify(await p.evaluate(() => window.INFO)), Math.round(b64.length * .75 / 1024) + 'KB', ((Date.now() - t) / 1000) + 's', n === 'apartment' ? JSON.stringify(await p.evaluate(() => window.APT_INFO)) : ''); }
  else console.log(n, 'FAILED');
  await p.close();
 }
 await b.close(); })();
