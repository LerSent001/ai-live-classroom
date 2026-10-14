/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const verifyEntrance = require('./youth-entrance-fixture.cjs');
const base = process.env.YOUTH_TEST_URL || 'http://localhost:3011';
const out = 'output/room-arrival';
fs.mkdirSync(out, { recursive: true });
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const results=[];
 try {
  for (const [name,width,height,reduced] of [['desktop',1440,900,false],['mobile',390,844,false],['reduced',390,844,true]]) {
   const context=await browser.newContext({viewport:{width,height},reducedMotion:reduced?'reduce':'no-preference'});
   await context.route('**/*',route=> !route.request().url().startsWith(base) || (route.request().method()==='POST' && /\/classroom\//.test(route.request().url())) ? route.abort() : route.continue());
   const page=await context.newPage(); const errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   page.on('console',m=>{if(m.type()==='error' && /Shader Error|VALIDATE_STATUS|compile/i.test(m.text()))errors.push(m.text());});
   await page.addInitScript(()=>{window.arrivalFrames=[]; const sample=()=>{const c=document.querySelector('.youth-scene canvas'); if(c?.dataset.cameraPosition)window.arrivalFrames.push({...c.dataset}); if(c?.dataset.entranceProgress!=='1')requestAnimationFrame(sample);};requestAnimationFrame(sample);});
   const result=await verifyEntrance(page,base,out,name,reduced);
   const frames=await page.evaluate(()=>window.arrivalFrames);
   assert.ok(frames.length>0);
   assert.equal(new Set(frames.map(f=>f.cameraPosition)).size,1,'First-entry camera stays fixed');
   const canvas=page.locator('.youth-scene canvas');
   assert.equal(await canvas.getAttribute('data-arrival-time'),'10');
   const before=await canvas.getAttribute('data-render-frames');
   await page.waitForTimeout(1200);
   assert.equal(await canvas.getAttribute('data-render-frames'),before,'Room stops rendering after arrival');
   await page.screenshot({path:`${out}/${name}-ready.png`});
   assert.deepEqual(errors,[]);
   results.push({...result,frames,errors}); await context.close();
  }
  results.push(await verifyEntrance.verifyFailure(browser,base,out));
  fs.writeFileSync(`${out}/checks.json`,JSON.stringify(results,null,2));
  console.log(JSON.stringify(results.map(r=>({...r,frames:r.frames?.length}))));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
