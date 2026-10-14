/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.YOUTH_TEST_URL || 'http://localhost:3011';
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  fs.mkdirSync('output/authored-motion', {recursive:true});
  const results=[];
  try {
    for (const width of [1440,390]) {
      const context=await browser.newContext({viewport:{width,height:900}});
      const page=await context.newPage(); const errors=[];
      page.on('pageerror', e=>errors.push(String(e)));
      page.on('console', m=>{if(m.type()==='error') errors.push(m.text());});
      await context.route('**/*', route=>{
        const request=route.request(); const url=new URL(request.url());
        if(url.origin!==base) return route.abort();
        if(request.method()==='POST') {
          // Empty-session bootstrap is free. Any generation/lesson command is forbidden.
          if(url.pathname!=='/api/youth/classroom' || request.postDataJSON()?.kind) return route.abort();
        }
        return route.continue();
      });
      await page.goto(`${base}/zh-youth`);
      const selector='.youth-vroid-portrait canvas';
      await page.waitForFunction(s=>document.querySelector(s)?.dataset.handMotion==='greeting',selector,{timeout:60000});
      const bubble=page.locator('.youth-mentor-bubble');
      assert.equal(await bubble.locator('svg.youth-mentor-cloud').count(),1);
      const cloudBox=await bubble.boundingBox();
      assert.ok(cloudBox.x>=0 && cloudBox.x+cloudBox.width<=width,'Cloud fits the viewport');
      assert.ok(cloudBox.y>0,'Cloud is not clipped at the top');
      for(let frame=0;frame<4;frame++) {
        await page.waitForTimeout(600);
        await page.screenshot({path:`output/authored-motion/${width}-greeting-${frame}.png`});
      }
      await page.waitForFunction(s=>document.querySelector(s)?.dataset.handMotion==='authored-rest',selector);
      await page.screenshot({path:`output/authored-motion/${width}-rest.png`});
      await page.waitForFunction(s=>document.querySelector(s)?.dataset.handMotion==='model-pose',selector,{timeout:20000});
      for(let frame=0;frame<4;frame++) {
        await page.waitForTimeout(1300);
        await page.screenshot({path:`output/authored-motion/${width}-pose-${frame}.png`});
      }
      await page.emulateMedia({reducedMotion:'reduce'}); await page.waitForTimeout(300);
      const before=await page.locator(selector).getAttribute('data-portrait-frames');
      await page.waitForTimeout(1000);
      assert.equal(await page.locator(selector).getAttribute('data-portrait-frames'),before);
      assert.deepEqual(errors,[]);
      results.push({width,errors,metrics:await page.locator(selector).evaluate(el=>({...el.dataset})),reducedMotionExtraFrames:0});
      await context.close();
    }
    fs.writeFileSync('output/authored-motion/check.json',JSON.stringify(results,null,2));
    console.log(JSON.stringify(results));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
