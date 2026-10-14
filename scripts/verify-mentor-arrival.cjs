/* eslint-disable @typescript-eslint/no-require-imports */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sharp = require('sharp');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = process.env.YOUTH_TEST_URL || 'http://localhost:3011';
const out = 'output/mentor-arrival-qa';
(async () => {
  fs.mkdirSync(out, {recursive:true});
  const browser = await chromium.launch({headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-gpu','--use-angle=metal','--disable-background-networking']});
  const results = [];
  try {
    for (const mode of ['desktop','mobile','reduced']) {
      const context = await browser.newContext({viewport:{width:mode==='mobile'?390:1440,height:900},reducedMotion:mode==='reduced'?'reduce':'no-preference'});
      await context.route('**/*', route => {
        const r=route.request(), u=new URL(r.url());
        if(u.origin!==base) return route.abort();
        if(r.method()==='POST' && (u.pathname!=='/api/youth/classroom' || r.postDataJSON()?.kind)) return route.abort();
        return route.continue();
      });
      const page=await context.newPage(), errors=[];
      page.on('pageerror',e=>errors.push(String(e)));
      page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.goto(base);
      const selector='.youth-vroid-portrait canvas';
      const frames=[];
      for(const progress of mode==='reduced'?[1]:[.15,.48,1]) {
        await page.waitForFunction(({selector,progress})=>Number(document.querySelector(selector)?.dataset.mentorArrival)>=progress,{selector,progress},{timeout:90000});
        const sample=await page.locator(selector).evaluate(c=>({image:c.toDataURL(),metrics:{...c.dataset}}));
        const buffer=Buffer.from(sample.image.split(',')[1],'base64');
        const raw=await sharp(buffer).ensureAlpha().raw().toBuffer();
        let coverage=0;for(let i=3;i<raw.length;i+=4)if(raw[i]>128)coverage++;
        fs.writeFileSync(`${out}/${mode}-${progress}-portrait.png`,buffer);
        await page.screenshot({path:`${out}/${mode}-${progress}.png`});
        frames.push({progress:Number(sample.metrics.mentorArrival),coverage,drawCalls:Number(sample.metrics.portraitDrawCalls)});
      }
      if(mode!=='reduced') {
        assert.ok(frames[0].progress<.48,'Capture genuinely partial arrival');
        assert.ok(frames[0].coverage<frames[1].coverage && frames[1].coverage<frames[2].coverage,'Square reveal grows to the full model');
        await page.waitForFunction(s=>document.querySelector(s)?.dataset.handMotion==='greeting',selector,{timeout:10000});
      }
      await page.waitForSelector(`${selector}[data-mentor-presented="true"]`);
      const input=page.locator('.youth-composer input'); await input.focus();
      assert.equal(await input.evaluate(el=>getComputedStyle(el).outlineStyle),'none');
      const theme=await page.locator('.youth-classroom').evaluate(el=>getComputedStyle(el).getPropertyValue('--youth-ink').trim());
      assert.equal(theme,'#304a3b');
      await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(300);
      const before=await page.locator(selector).getAttribute('data-portrait-frames');
      await page.waitForTimeout(1200);
      assert.equal(await page.locator(selector).getAttribute('data-portrait-frames'),before,'Rest remains demand-rendered');
      assert.deepEqual(errors,[]);
      results.push({mode,frames,theme,errors,idleExtraFrames:0,realProviderCalls:0});
      await context.close();
    }
    fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
