import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, args:['--autoplay-policy=no-user-gesture-required','--use-angle=d3d11','--ignore-gpu-blocklist','--no-sandbox']});
const p = await b.newPage({viewport:{width:900,height:520}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,200));});
await p.goto('http://localhost:5199/?shot=1&q=high',{waitUntil:'load'});
await p.waitForFunction(()=>window.__aq&&window.__audio);
await p.mouse.click(450,260); // gesture -> starts audio (may hit water/glass too)
await p.waitForTimeout(500);
const r = await p.evaluate(async()=>{ const a=window.__audio; a.tap({x:0,strength:1}); a.bubble({x:0.1,r:0.0015}); a.drop({x:0}); a.eat({x:0}); a.pop({x:0}); window.__aq.advance(6);
  return { started:a.started, bubbles: window.__aq.sys.bubbles.bubbles.filter(b=>b.alive).length }; });
console.log(JSON.stringify(r), 'errors:', errs);
await b.close();
